#!/usr/bin/env node
/**
 * Encryption Key Rotation Script
 *
 * Rotates all Notion workspace access tokens to use the current encryption key.
 * Run this after updating ENCRYPTION_KEY to a new value.
 *
 * BEFORE RUNNING:
 * 1. Generate new key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * 2. Copy current ENCRYPTION_KEY value to ENCRYPTION_KEY_V{n} (where n is current version)
 * 3. Set new key as ENCRYPTION_KEY
 * 4. Increment ENCRYPTION_KEY_VERSION
 * 5. Run this script: node scripts/rotateEncryptionKeys.js
 *
 * EXAMPLE:
 * # Before rotation (.env)
 * ENCRYPTION_KEY=old_key_here
 * ENCRYPTION_KEY_VERSION=1
 *
 * # After rotation (.env)
 * ENCRYPTION_KEY=new_key_here
 * ENCRYPTION_KEY_V1=old_key_here  # Keep old key for migration
 * ENCRYPTION_KEY_VERSION=2
 *
 * # Then run:
 * node scripts/rotateEncryptionKeys.js
 *
 * @module scripts/rotateEncryptionKeys
 */

import 'dotenv/config';
import { connectDB, disconnectDB } from '../config/database.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { getKeyRotationStatus, generateEncryptionKey } from '../utils/security/encryption.js';
import logger from '../config/logger.js';

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const showStatus = args.includes('--status');
  const generateKey = args.includes('--generate-key');

  console.log('='.repeat(60));
  console.log('Encryption Key Rotation Tool');
  console.log('='.repeat(60));

  // Generate new key helper
  if (generateKey) {
    const newKey = generateEncryptionKey();
    console.log('\nGenerated new encryption key (save this securely):');
    console.log(newKey);
    console.log('\nTo rotate keys:');
    console.log('1. Copy your current ENCRYPTION_KEY to ENCRYPTION_KEY_V{current_version}');
    console.log('2. Set ENCRYPTION_KEY to the new key above');
    console.log('3. Increment ENCRYPTION_KEY_VERSION');
    console.log('4. Run: node scripts/rotateEncryptionKeys.js');
    return;
  }

  // Show key status
  const status = getKeyRotationStatus();
  console.log('\nKey Status:');
  console.log(`  Current version: ${status.currentVersion}`);
  console.log(`  Available keys: ${status.availableVersions.join(', ')}`);
  if (status.missingVersions.length > 0) {
    console.log(`  ⚠️  Missing keys: ${status.missingVersions.join(', ')}`);
    console.log('     Set ENCRYPTION_KEY_V{n} for each missing version to enable rotation');
  } else {
    console.log('  ✓ All historical keys available');
  }

  if (showStatus) {
    return;
  }

  // Connect to database
  console.log('\nConnecting to database...');
  await connectDB();

  try {
    // Find workspaces needing rotation
    const workspacesNeedingRotation = await NotionWorkspace.findNeedingRotation();
    console.log(`\nWorkspaces needing rotation: ${workspacesNeedingRotation.length}`);

    if (workspacesNeedingRotation.length === 0) {
      console.log('✓ All tokens are using the current key version');
      return;
    }

    // Show what will be rotated
    console.log('\nWorkspaces to rotate:');
    for (const ws of workspacesNeedingRotation) {
      const version = ws.getTokenEncryptionVersion();
      console.log(
        `  - ${ws.workspaceName || ws.workspaceId} (v${version} → v${status.currentVersion})`
      );
    }

    if (isDryRun) {
      console.log('\n[DRY RUN] No changes made. Remove --dry-run to rotate.');
      return;
    }

    // Check if we can decrypt all versions
    if (!status.canDecryptAll) {
      console.error('\n❌ Cannot rotate: missing keys for some versions');
      console.error('   Set the missing ENCRYPTION_KEY_V{n} environment variables');
      process.exit(1);
    }

    // Confirm rotation
    console.log('\nRotating tokens...');
    const results = await NotionWorkspace.rotateAllTokens();

    console.log('\n' + '='.repeat(60));
    console.log('Rotation Results:');
    console.log('='.repeat(60));
    console.log(`  Total workspaces: ${results.total}`);
    console.log(`  Successfully rotated: ${results.rotated}`);
    console.log(`  Failed: ${results.failed}`);

    if (results.errors.length > 0) {
      console.log('\nErrors:');
      for (const err of results.errors) {
        console.log(`  - ${err.workspaceId}: ${err.error}`);
      }
    }

    if (results.rotated > 0) {
      console.log('\n✓ Key rotation complete!');
      console.log('\nIMPORTANT: After confirming all tokens work:');
      console.log('1. Test Notion API access for rotated workspaces');
      console.log('2. Keep ENCRYPTION_KEY_V{old} for a grace period');
      console.log('3. Remove old key environment variables after verification');
    }
  } catch (error) {
    logger.error('Key rotation failed:', error);
    console.error('\n❌ Rotation failed:', error.message);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error('Script error:', error);
  process.exit(1);
});
