/**
 * Migration script to fix stale workspace_id_1_user_id_1 index
 *
 * The WorkspaceMember schema uses camelCase (workspaceId, userId) but there's
 * a stale index with snake_case field names from a previous schema version.
 * This causes duplicate key errors when inserting documents.
 *
 * Run with: node scripts/fix-workspace-member-index.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/enterprise_rag';

async function fixWorkspaceMemberIndex() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('workspacemembers');

    // List current indexes
    console.log('\nCurrent indexes on workspacemembers collection:');
    const indexes = await collection.indexes();
    indexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Check for stale snake_case index
    const staleIndex = indexes.find((idx) => idx.name === 'workspace_id_1_user_id_1');

    if (staleIndex) {
      console.log('\nFound stale index: workspace_id_1_user_id_1');
      console.log('Dropping stale index...');
      await collection.dropIndex('workspace_id_1_user_id_1');
      console.log('Stale index dropped successfully');
    } else {
      console.log('\nNo stale workspace_id_1_user_id_1 index found');
    }

    // Remove any documents with null workspace_id or user_id (from old schema)
    console.log('\nChecking for documents with null workspace_id or user_id...');
    const nullDocs = await collection
      .find({
        $or: [{ workspace_id: null }, { user_id: null }],
      })
      .toArray();

    if (nullDocs.length > 0) {
      console.log(`Found ${nullDocs.length} documents with null values`);
      const result = await collection.deleteMany({
        $or: [{ workspace_id: null }, { user_id: null }],
      });
      console.log(`Deleted ${result.deletedCount} documents`);
    } else {
      console.log('No documents with null workspace_id/user_id found');
    }

    // Also check for documents with null workspaceId or userId (camelCase)
    console.log('\nChecking for documents with null workspaceId or userId...');
    const nullCamelDocs = await collection
      .find({
        $or: [{ workspaceId: null }, { userId: null }],
      })
      .toArray();

    if (nullCamelDocs.length > 0) {
      console.log(`Found ${nullCamelDocs.length} documents with null values`);
      const result = await collection.deleteMany({
        $or: [{ workspaceId: null }, { userId: null }],
      });
      console.log(`Deleted ${result.deletedCount} documents`);
    } else {
      console.log('No documents with null workspaceId/userId found');
    }

    // Verify correct index exists (Mongoose will create it on model load)
    console.log('\nFinal indexes on workspacemembers collection:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Check if correct camelCase index exists
    const correctIndex = finalIndexes.find((idx) => idx.name === 'workspaceId_1_userId_1');
    if (!correctIndex) {
      console.log('\nCreating correct workspaceId_1_userId_1 index...');
      await collection.createIndex({ workspaceId: 1, userId: 1 }, { unique: true });
      console.log('Index created successfully');
    } else {
      console.log('\nCorrect workspaceId_1_userId_1 index already exists');
    }

    console.log('\nMigration completed successfully!');
    console.log('You can now retry connecting your Notion workspace.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

fixWorkspaceMemberIndex();
