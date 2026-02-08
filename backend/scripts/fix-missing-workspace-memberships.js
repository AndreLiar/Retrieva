/**
 * Migration script to fix missing WorkspaceMember entries for workspace owners
 *
 * This script finds NotionWorkspaces that don't have a corresponding WorkspaceMember
 * entry for their owner and creates the missing entries.
 *
 * Run with: node scripts/fix-missing-workspace-memberships.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/enterprise_rag';

// Define schemas inline to avoid import issues
const notionWorkspaceSchema = new mongoose.Schema({}, { strict: false });
const workspaceMemberSchema = new mongoose.Schema({}, { strict: false });

async function fixMissingMemberships() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const NotionWorkspace = mongoose.model('NotionWorkspace', notionWorkspaceSchema);
    const WorkspaceMember = mongoose.model('WorkspaceMember', workspaceMemberSchema);

    // Get all workspaces
    const workspaces = await NotionWorkspace.find({}).lean();
    console.log(`Found ${workspaces.length} workspaces`);

    let fixed = 0;
    let alreadyOk = 0;

    for (const workspace of workspaces) {
      const ownerId = workspace.userId;
      if (!ownerId) {
        console.log(`  Skipping workspace ${workspace.workspaceId} - no userId`);
        continue;
      }

      // Check if membership exists
      const existingMembership = await WorkspaceMember.findOne({
        workspaceId: workspace._id,
        userId: ownerId,
      });

      if (existingMembership) {
        alreadyOk++;
        continue;
      }

      // Create missing membership
      await WorkspaceMember.create({
        workspaceId: workspace._id,
        userId: ownerId,
        role: 'owner',
        status: 'active',
        permissions: {
          canQuery: true,
          canViewSources: true,
          canInvite: true,
        },
        joinedAt: new Date(),
      });

      console.log(`  Created membership for workspace ${workspace.workspaceName || workspace.workspaceId}`);
      fixed++;
    }

    console.log(`\nResults:`);
    console.log(`  - Already OK: ${alreadyOk}`);
    console.log(`  - Fixed: ${fixed}`);
    console.log(`  - Total: ${workspaces.length}`);

    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

fixMissingMemberships();
