/* eslint-disable no-console */
/**
 * Migration: Conversation.workspaceId — Mixed → ObjectId
 *
 * Run BEFORE deploying the schema change that removes Mixed type.
 * Finds all conversations where workspaceId is the legacy string 'default'
 * and sets them to null so the new ObjectId schema accepts them.
 *
 * Usage:
 *   MONGODB_URI=<uri> node backend/scripts/migrateConversationWorkspaceId.js
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI env var is required');
  process.exit(1);
}

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await mongoose.connection
    .collection('conversations')
    .updateMany({ workspaceId: 'default' }, { $set: { workspaceId: null } });

  console.log(
    `Migrated ${result.modifiedCount} conversation(s) from workspaceId='default' to null`
  );
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
