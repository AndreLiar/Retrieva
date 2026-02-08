#!/usr/bin/env node
/**
 * Retrieval Evaluation Script
 *
 * Measures retrieval quality (Recall@K, MRR@K, chunk quality ratios)
 * against a golden query set. No LLM calls — retrieval-only.
 *
 * Usage:
 *   node scripts/evaluate.js
 *   node scripts/evaluate.js --top-k=5
 *   node scripts/evaluate.js --top-k=10 --verbose
 */

import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { connectDB } from '../config/database.js';
import { getVectorStore } from '../config/vectorStore.js';
import { rerankDocuments } from '../services/rag/documentRanking.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { topK: 10, verbose: false };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--top-k=')) {
      args.topK = parseInt(arg.split('=')[1], 10) || 10;
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Metrics helpers
// ---------------------------------------------------------------------------

function computeRecallAtK(retrievedIds, expectedIds, k) {
  if (expectedIds.length === 0) return null; // cannot evaluate without ground truth
  const topK = retrievedIds.slice(0, k);
  const hits = expectedIds.filter((id) => topK.includes(id)).length;
  return hits / expectedIds.length;
}

function computeMRRAtK(retrievedIds, expectedIds, k) {
  if (expectedIds.length === 0) return null;
  const topK = retrievedIds.slice(0, k);
  for (let i = 0; i < topK.length; i++) {
    if (expectedIds.includes(topK[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// ---------------------------------------------------------------------------
// Main evaluation loop
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const K = args.topK;

  console.log('='.repeat(60));
  console.log(`Retrieval Evaluation  |  top-k=${K}  |  verbose=${args.verbose}`);
  console.log('='.repeat(60));

  // Load golden queries
  const fixturePath = join(__dirname, '..', 'tests', 'fixtures', 'goldenQueries.json');
  const raw = await readFile(fixturePath, 'utf-8');
  const goldenQueries = JSON.parse(raw);
  console.log(`Loaded ${goldenQueries.length} golden queries\n`);

  // Connect to DB + vector store
  await connectDB();
  const vectorStore = await getVectorStore([]);

  const results = [];

  for (const gq of goldenQueries) {
    const label = `[${gq.id}] ${gq.query.substring(0, 60)}${gq.query.length > 60 ? '...' : ''}`;
    process.stdout.write(`  ${label} ... `);

    try {
      // Retrieve
      const rawDocs = await vectorStore.similaritySearch(gq.query, 15);

      // Re-rank
      const reranked = rerankDocuments(rawDocs, gq.query, K);

      // Compute per-query metrics
      const retrievedSourceIds = reranked.map((d) => d.metadata?.sourceId).filter(Boolean);
      const recall = computeRecallAtK(retrievedSourceIds, gq.expectedSourceIds, K);
      const mrr = computeMRRAtK(retrievedSourceIds, gq.expectedSourceIds, K);

      const tokens = reranked.map((d) => estimateTokens(d.pageContent));
      const tinyCount = tokens.filter((t) => t < 50).length;
      const junkCount = reranked.filter((d) => {
        const c = (d.pageContent || '').trim();
        return c.length < 20 || /^\[Table of Contents\]$/i.test(c) || /^\[Breadcrumb\]$/i.test(c) || /^---+$/.test(c) || /^\[Link to page\]$/i.test(c);
      }).length;

      const entry = {
        id: gq.id,
        language: gq.language,
        category: gq.category,
        retrievedCount: reranked.length,
        recall,
        mrr,
        tinyChunkRatio: reranked.length > 0 ? tinyCount / reranked.length : 0,
        junkChunkRatio: reranked.length > 0 ? junkCount / reranked.length : 0,
        avgTokens: tokens.length > 0 ? tokens.reduce((a, b) => a + b, 0) / tokens.length : 0,
      };
      results.push(entry);

      const recallStr = recall !== null ? recall.toFixed(2) : 'N/A';
      const mrrStr = mrr !== null ? mrr.toFixed(2) : 'N/A';
      console.log(`R@${K}=${recallStr}  MRR=${mrrStr}  tiny=${tinyCount}  junk=${junkCount}`);

      if (args.verbose) {
        for (let i = 0; i < reranked.length; i++) {
          const d = reranked[i];
          const t = estimateTokens(d.pageContent);
          const src = d.metadata?.sourceId || '?';
          const hp = (d.metadata?.heading_path || []).join(' > ') || '-';
          const bt = d.metadata?.block_type || '-';
          console.log(`    #${i + 1}  tokens=${t}  block_type=${bt}  src=${src}  heading=${hp}`);
        }
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ id: gq.id, error: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const evaluated = results.filter((r) => !r.error);
  const withGroundTruth = evaluated.filter((r) => r.recall !== null);

  if (withGroundTruth.length > 0) {
    const avgRecall = withGroundTruth.reduce((s, r) => s + r.recall, 0) / withGroundTruth.length;
    const avgMRR = withGroundTruth.reduce((s, r) => s + r.mrr, 0) / withGroundTruth.length;
    console.log(`  Avg Recall@${K}:      ${avgRecall.toFixed(3)}  (${withGroundTruth.length} queries with ground truth)`);
    console.log(`  Avg MRR@${K}:         ${avgMRR.toFixed(3)}`);
  } else {
    console.log('  No queries have expectedSourceIds — fill them in to compute Recall/MRR.');
  }

  const avgTiny = evaluated.reduce((s, r) => s + r.tinyChunkRatio, 0) / (evaluated.length || 1);
  const avgJunk = evaluated.reduce((s, r) => s + r.junkChunkRatio, 0) / (evaluated.length || 1);
  const avgTokens = evaluated.reduce((s, r) => s + r.avgTokens, 0) / (evaluated.length || 1);

  console.log(`  Avg tiny chunk ratio: ${(avgTiny * 100).toFixed(1)}%  (< 50 tokens)`);
  console.log(`  Avg junk chunk ratio: ${(avgJunk * 100).toFixed(1)}%`);
  console.log(`  Avg tokens/chunk:     ${avgTokens.toFixed(0)}`);
  console.log(`  Total queries:        ${goldenQueries.length}`);
  console.log(`  Errors:               ${results.filter((r) => r.error).length}`);

  // Per-category breakdown
  const categories = [...new Set(evaluated.map((r) => r.category))];
  if (categories.length > 1) {
    console.log('\n  Per-category breakdown:');
    for (const cat of categories) {
      const catResults = evaluated.filter((r) => r.category === cat);
      const catTiny = catResults.reduce((s, r) => s + r.tinyChunkRatio, 0) / catResults.length;
      const catJunk = catResults.reduce((s, r) => s + r.junkChunkRatio, 0) / catResults.length;
      console.log(`    ${cat.padEnd(15)} n=${catResults.length}  tiny=${(catTiny * 100).toFixed(1)}%  junk=${(catJunk * 100).toFixed(1)}%`);
    }
  }

  console.log('\nDone!');
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
