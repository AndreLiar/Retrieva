#!/usr/bin/env node
/**
 * seedComplianceKb.js
 *
 * Embeds DORA regulation articles + EBA/ESMA/EIOPA RTS entries into the
 * shared, read-only Qdrant collection: `compliance_kb`.
 *
 * Modes:
 *   node backend/scripts/seedComplianceKb.js
 *       Smart sync (default) — skips if Qdrant point count matches JSON article
 *       count. Re-seeds automatically when new articles are added. Suitable for
 *       automated CD pipeline execution.
 *
 *   node backend/scripts/seedComplianceKb.js --reset
 *       Force full rebuild — deletes the collection and re-seeds from scratch.
 *       Use when article text has been updated (not just new articles added).
 *
 * The collection is shared across all assessments (read-only reference data).
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { randomUUID } from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { AzureOpenAIEmbeddings } from '@langchain/openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
export const COMPLIANCE_KB_COLLECTION = 'compliance_kb';
const VECTOR_SIZE = 1536; // text-embedding-3-small

const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_EMBEDDING_DEPLOYMENT =
  process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
const AZURE_OPENAI_INSTANCE_NAME =
  process.env.AZURE_OPENAI_INSTANCE_NAME ||
  (AZURE_OPENAI_ENDPOINT ? AZURE_OPENAI_ENDPOINT.match(/https:\/\/([^.]+)\./)?.[1] : undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getQdrantClient() {
  const opts = { url: QDRANT_URL, checkCompatibility: false };
  if (QDRANT_API_KEY) opts.apiKey = QDRANT_API_KEY;
  return new QdrantClient(opts);
}

function getEmbeddings() {
  return new AzureOpenAIEmbeddings({
    azureOpenAIApiKey: AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: AZURE_OPENAI_INSTANCE_NAME,
    azureOpenAIApiDeploymentName: AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    azureOpenAIApiVersion: AZURE_OPENAI_API_VERSION,
    maxConcurrency: 5,
  });
}

/**
 * Load knowledge base from JSON.
 * Supports both old format (plain array) and new format ({ version, articles }).
 * Returns { articles, meta }.
 */
function loadData() {
  const filePath = path.join(__dirname, '../data/compliance/dora-articles.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (Array.isArray(raw)) {
    return { articles: raw, meta: { version: '1.0', lastVerified: null, sources: [] } };
  }
  return {
    articles: raw.articles,
    meta: { version: raw.version, lastVerified: raw.lastVerified, sources: raw.sources || [] },
  };
}

/**
 * Build the text we embed for each article.
 * Combines header + obligations + full text for maximum retrieval coverage.
 */
function buildEmbedText(article) {
  const obligationsText = article.obligations?.join('; ') || '';
  return [
    `${article.regulation} ${article.article}: ${article.title}`,
    `Domain: ${article.domain}`,
    `Key obligations: ${obligationsText}`,
    article.text,
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function collectionExists(client) {
  try {
    await client.getCollection(COMPLIANCE_KB_COLLECTION);
    return true;
  } catch {
    return false;
  }
}

async function getCollectionPointCount(client) {
  try {
    const info = await client.getCollection(COMPLIANCE_KB_COLLECTION);
    return info.points_count || 0;
  } catch {
    return 0;
  }
}

async function createCollection(client) {
  await client.createCollection(COMPLIANCE_KB_COLLECTION, {
    vectors: {
      size: VECTOR_SIZE,
      distance: 'Cosine',
    },
    optimizers_config: { default_segment_number: 2 },
    replication_factor: 1,
  });
  console.log(`Created Qdrant collection: ${COMPLIANCE_KB_COLLECTION}`);
}

async function embedAndUpsert(client, articles) {
  const embeddings = getEmbeddings();
  const texts = articles.map(buildEmbedText);

  console.log(`Embedding ${articles.length} entries (this may take 30–90 seconds)…`);
  const vectors = await embeddings.embedDocuments(texts);
  console.log(`Embedded ${vectors.length} entries.`);

  const points = articles.map((article, i) => ({
    id: randomUUID(),
    vector: vectors[i],
    payload: {
      pageContent: texts[i],
      metadata: {
        regulation: article.regulation,
        article: article.article,
        title: article.title,
        domain: article.domain,
        obligations: article.obligations || [],
        fullText: article.text,
      },
    },
  }));

  await client.upsert(COMPLIANCE_KB_COLLECTION, { wait: true, points });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  const args = process.argv.slice(2);
  const forceReset = args.includes('--reset');

  const client = getQdrantClient();
  const { articles, meta } = loadData();

  console.log(`Connecting to Qdrant at ${QDRANT_URL}…`);
  console.log(`Knowledge base: v${meta.version}, lastVerified: ${meta.lastVerified || 'unknown'}`);
  console.log(`Total entries to sync: ${articles.length}`);

  const exists = await collectionExists(client);

  if (exists && !forceReset) {
    // ── Smart sync: compare point count to article count ──────────────────
    const currentCount = await getCollectionPointCount(client);

    if (currentCount === articles.length) {
      console.log(
        `✓ Collection "${COMPLIANCE_KB_COLLECTION}" is up to date (${currentCount} points = ${articles.length} entries). No action needed.`
      );
      process.exit(0);
    }

    console.log(
      `Point count mismatch — Qdrant: ${currentCount}, JSON: ${articles.length}. Re-seeding…`
    );
    await client.deleteCollection(COMPLIANCE_KB_COLLECTION);
  } else if (exists && forceReset) {
    console.log(`--reset flag: deleting existing collection "${COMPLIANCE_KB_COLLECTION}"…`);
    await client.deleteCollection(COMPLIANCE_KB_COLLECTION);
  }

  await createCollection(client);
  await embedAndUpsert(client, articles);

  console.log(`\n✓ Seeded ${articles.length} entries into "${COMPLIANCE_KB_COLLECTION}".`);

  // Print domain summary
  const byRegulation = articles.reduce((acc, a) => {
    acc[a.regulation] = (acc[a.regulation] || 0) + 1;
    return acc;
  }, {});
  console.log('Regulation breakdown:');
  for (const [reg, count] of Object.entries(byRegulation)) {
    console.log(`  - ${reg}: ${count} entries`);
  }

  const domains = [...new Set(articles.map((a) => a.domain))];
  console.log('Domains indexed:');
  for (const d of domains) {
    const count = articles.filter((a) => a.domain === d).length;
    console.log(`  - ${d}: ${count} entries`);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
