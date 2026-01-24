/**
 * Migration Script: Add Workspace Owners as Members
 *
 * This script migrates existing workspaces to the new membership model
 * by adding the workspace creator (userId) as an owner member.
 *
 * Run: node scripts/migrateWorkspaceOwners.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { User } from '../models/User.js';

dotenv.config();

async function migrateWorkspaceOwners() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all workspaces
    const workspaces = await NotionWorkspace.find({});
    console.log(`Found ${workspaces.length} workspaces to migrate`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const workspace of workspaces) {
      console.log(`\nProcessing workspace: ${workspace.workspaceName} (${workspace._id})`);
      console.log(`  Owner userId: ${workspace.userId}`);

      // Check if membership already exists
      const existingMembership = await WorkspaceMember.findOne({
        workspaceId: workspace._id,
      });

      if (existingMembership) {
        console.log(`  Membership already exists, skipping`);
        skipped++;
        continue;
      }

      // Find the user by userId string (could be ObjectId or string)
      let user;

      // Try finding by _id first
      if (mongoose.Types.ObjectId.isValid(workspace.userId)) {
        user = await User.findById(workspace.userId);
      }

      // If not found, try finding by other fields
      if (!user) {
        user = await User.findOne({
          $or: [{ _id: workspace.userId }, { email: workspace.userId }],
        });
      }

      if (!user) {
        console.log(`  WARNING: User not found for userId: ${workspace.userId}`);
        console.log(`  Creating membership with string userId anyway...`);

        // Create membership even without valid user reference
        // This handles legacy data where userId might be a string like 'default-user'
        try {
          await WorkspaceMember.create({
            workspaceId: workspace._id,
            userId: workspace.userId, // Store as-is
            role: 'owner',
            status: 'active',
            permissions: {
              canQuery: true,
              canViewSources: true,
              canInvite: true,
            },
          });
          console.log(`  Created owner membership (legacy userId)`);
          migrated++;
        } catch (err) {
          console.log(`  ERROR creating membership: ${err.message}`);
          errors++;
        }
        continue;
      }

      // Create owner membership
      try {
        await WorkspaceMember.addOwner(workspace._id, user._id);
        console.log(`  Created owner membership for user: ${user.email}`);
        migrated++;
      } catch (err) {
        console.log(`  ERROR creating membership: ${err.message}`);
        errors++;
      }
    }

    console.log('\n========================================');
    console.log('Migration Complete');
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped (already exists): ${skipped}`);
    console.log(`  Errors: ${errors}`);
    console.log('========================================');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run migration
migrateWorkspaceOwners();
