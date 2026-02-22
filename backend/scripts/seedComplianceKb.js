#!/usr/bin/env node
/**
 * seedComplianceKb.js
 *
 * One-time (idempotent) script that embeds the DORA regulation articles
 * into a shared, read-only Qdrant collection: `compliance_kb`.
 *
 * Usage:
 *   node backend/scripts/seedComplianceKb.js
 *   node backend/scripts/seedComplianceKb.js --reset   (delete and re-seed)
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
  const opts = { url: QDRANT_URL };
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

function loadArticles() {
  const filePath = path.join(__dirname, '../data/compliance/dora-articles.json');
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/**
 * Build the text we embed for each article:
 * Combines article header + obligations + full text for maximum retrieval coverage.
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');

  const client = getQdrantClient();
  const embeddings = getEmbeddings();

  console.log(`Connecting to Qdrant at ${QDRANT_URL}…`);

  const exists = await collectionExists(client);

  if (exists && !reset) {
    const info = await client.getCollection(COMPLIANCE_KB_COLLECTION);
    const count = info.points_count || 0;
    console.log(`Collection "${COMPLIANCE_KB_COLLECTION}" already exists with ${count} points.`);
    console.log('Run with --reset to delete and re-seed.');
    process.exit(0);
  }

  if (exists && reset) {
    console.log(`Deleting existing collection "${COMPLIANCE_KB_COLLECTION}"…`);
    await client.deleteCollection(COMPLIANCE_KB_COLLECTION);
  }

  await createCollection(client);

  const articles = loadArticles();
  console.log(`Loaded ${articles.length} articles from dora-articles.json`);

  // Build texts for embedding
  const texts = articles.map(buildEmbedText);

  console.log('Embedding articles (this may take 30–60 seconds)…');
  const vectors = await embeddings.embedDocuments(texts);
  console.log(`Embedded ${vectors.length} articles.`);

  // Upsert to Qdrant
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

  console.log(`\n✓ Seeded ${points.length} DORA articles into "${COMPLIANCE_KB_COLLECTION}".`);
  console.log('Domains indexed:');
  const domains = [...new Set(articles.map((a) => a.domain))];
  domains.forEach((d) => {
    const count = articles.filter((a) => a.domain === d).length;
    console.log(`  - ${d}: ${count} articles`);
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
