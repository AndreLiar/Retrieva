#!/usr/bin/env node

/**
 * Qdrant Explorer Utility
 * Quick CLI tool to explore Qdrant collections
 */

import http from 'http';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';

// Helper to make HTTP requests
const request = (path, method = 'GET', data = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, QDRANT_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
};

// Commands
const commands = {
  async collections() {
    console.log('\n📚 Collections:\n');
    const result = await request('/collections');
    console.log(JSON.stringify(result.result.collections, null, 2));
  },

  async info() {
    console.log(`\n📊 Collection Info: ${COLLECTION_NAME}\n`);
    const result = await request(`/collections/${COLLECTION_NAME}`);
    const info = result.result;
    console.log(`Status: ${info.status}`);
    console.log(`Points: ${info.points_count}`);
    console.log(`Vectors: ${info.vectors_count}`);
    console.log(`Vector Size: ${info.config.params.vectors.size}`);
    console.log(`Distance: ${info.config.params.vectors.distance}`);
  },

  async count() {
    console.log(`\n🔢 Points Count:\n`);
    const result = await request(`/collections/${COLLECTION_NAME}/points/count`);
    console.log(`Total points: ${result.result.count}`);
  },

  async list() {
    console.log(`\n📄 Documents in ${COLLECTION_NAME}:\n`);
    const result = await request(`/collections/${COLLECTION_NAME}/points/scroll`, 'POST', {
      limit: 100,
      with_payload: true,
      with_vector: false,
    });

    result.result.points.forEach((point, idx) => {
      console.log(`\n${idx + 1}. ID: ${point.id}`);
      console.log(`   Source: ${point.payload.metadata?.source || 'N/A'}`);
      console.log(`   Content: ${point.payload.content?.substring(0, 150)}...`);
    });
    console.log(`\nTotal: ${result.result.points.length} documents`);
  },

  async search(query = 'LangChain') {
    console.log(`\n🔍 Searching for: "${query}"\n`);
    console.log('Note: This requires generating embeddings first.');
    console.log('Use the RAG API endpoint instead for actual searches.\n');
  },

  help() {
    console.log(`
📖 Qdrant Explorer Commands:

  node utils/qdrantExplorer.js collections   # List all collections
  node utils/qdrantExplorer.js info         # Show collection info
  node utils/qdrantExplorer.js count        # Count documents
  node utils/qdrantExplorer.js list         # List all documents
  node utils/qdrantExplorer.js help         # Show this help

Environment Variables:
  QDRANT_URL=http://localhost:6333
  QDRANT_COLLECTION_NAME=langchain-rag

Web UI:
  http://localhost:6333/dashboard
    `);
  },
};

// Main
const command = process.argv[2] || 'help';
const args = process.argv.slice(3);

if (commands[command]) {
  commands[command](...args).catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
} else {
  console.error(`❌ Unknown command: ${command}`);
  commands.help();
  process.exit(1);
}
