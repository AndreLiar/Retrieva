import mongoose from 'mongoose';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const WORKSPACE_ID = 'b92a6333-89b4-4b09-a3da-9f7acaf0e16d';
const NEW_USER_ID = '6968122929adc31fba7cac14';

async function linkWorkspaceToUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Find the workspace
    const workspace = await NotionWorkspace.findOne({ workspaceId: WORKSPACE_ID });

    if (!workspace) {
      console.error('✗ Workspace not found!');
      process.exit(1);
    }

    console.log('\nCurrent workspace details:');
    console.log('  Name:', workspace.workspaceName);
    console.log('  Current userId:', workspace.userId);

    // Update the userId
    workspace.userId = NEW_USER_ID;
    workspace.metadata = workspace.metadata || {};
    workspace.metadata.createdBy = 'andrelaurelyvan.kanmegnetabouguie@ynov.com';
    await workspace.save();

    console.log('\n✅ Workspace successfully linked to new admin user!');
    console.log('  New userId:', workspace.userId);
    console.log('  Admin email: andrelaurelyvan.kanmegnetabouguie@ynov.com');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

linkWorkspaceToUser();
