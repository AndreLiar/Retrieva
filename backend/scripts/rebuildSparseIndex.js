#!/usr/bin/env node
/**
 * Rebuild Sparse Index Script
 *
 * Rebuilds vocabulary and sparse vectors for a workspace by fetching
 * documents from Qdrant. Use this to fix hybrid search for workspaces
 * that were indexed before vocabulary building was properly implemented.
 *
 * Usage:
 *   node scripts/rebuildSparseIndex.js <workspaceId>
 *   node scripts/rebuildSparseIndex.js --all
 *
 * Example:
 *   node scripts/rebuildSparseIndex.js 77833865-5bb2-4ae0-8ccd-52ea26fa4e29
 */

import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import { sparseVectorManager } from '../services/search/sparseVector.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import logger from '../config/logger.js';

dotenv.config();

async function rebuildForWorkspace(workspaceId) {
  console.log(`\n🔧 Rebuilding sparse index for workspace: ${workspaceId}`);

  try {
    // Get stats before rebuild
    const statsBefore = await sparseVectorManager.getStats(workspaceId);
    console.log(`   Before: ${statsBefore.vocabularySize} vocabulary terms, ${statsBefore.indexedDocuments} sparse vectors`);

    // Rebuild vocabulary from Qdrant
    const result = await sparseVectorManager.rebuildVocabularyFromQdrant(workspaceId);

    // Get stats after rebuild
    const statsAfter = await sparseVectorManager.getStats(workspaceId);
    console.log(`   After:  ${statsAfter.vocabularySize} vocabulary terms, ${statsAfter.indexedDocuments} sparse vectors`);

    console.log(`   ✅ Rebuilt vocabulary: ${result.vocabularySize} terms from ${result.totalDocuments} documents`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  node scripts/rebuildSparseIndex.js <workspaceId>');
    console.log('  node scripts/rebuildSparseIndex.js --all');
    console.log('\nExample:');
    console.log('  node scripts/rebuildSparseIndex.js 77833865-5bb2-4ae0-8ccd-52ea26fa4e29');
    process.exit(1);
  }

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await connectDB();

  if (args[0] === '--all') {
    // Rebuild for all workspaces
    console.log('Rebuilding sparse index for ALL workspaces...');

    const workspaces = await NotionWorkspace.find({ status: 'active' }).select('workspaceId workspaceName');
    console.log(`Found ${workspaces.length} active workspaces`);

    let success = 0;
    let failed = 0;

    for (const ws of workspaces) {
      const result = await rebuildForWorkspace(ws.workspaceId);
      if (result) success++;
      else failed++;
    }

    console.log(`\n📊 Summary: ${success} succeeded, ${failed} failed`);
  } else {
    // Rebuild for specific workspace
    const workspaceId = args[0];
    await rebuildForWorkspace(workspaceId);
  }

  console.log('\nDone!');
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
