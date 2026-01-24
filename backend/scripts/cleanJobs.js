import 'dotenv/config';
import { notionSyncQueue, documentIndexQueue } from '../config/queue.js';
import { connectDB } from '../config/database.js';
import { SyncJob } from '../models/SyncJob.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import logger from '../config/logger.js';

async function cleanAllJobs() {
  try {
    console.log('🧹 Cleaning all stuck jobs...\n');

    // Connect to MongoDB
    await connectDB();

    // Obliterate queues
    console.log('Obliterating notionSync queue...');
    await notionSyncQueue.obliterate({ force: true });
    console.log('  ✓ notionSync queue obliterated');

    console.log('\nObliterating documentIndex queue...');
    await documentIndexQueue.obliterate({ force: true });
    console.log('  ✓ documentIndex queue obliterated');

    // Clean database sync jobs
    console.log('\nCleaning MongoDB SyncJob records...');
    const result = await SyncJob.updateMany(
      { status: { $in: ['processing', 'queued'] } },
      { status: 'failed', error: { message: 'Manually cleaned' }, completedAt: new Date() }
    );
    console.log(`  ✓ Updated ${result.modifiedCount} sync job records`);

    // Reset workspace sync status
    console.log('\nResetting workspace sync status...');
    const workspaceResult = await NotionWorkspace.updateMany(
      { syncStatus: 'syncing' },
      { syncStatus: 'active' }
    );
    console.log(`  ✓ Reset ${workspaceResult.modifiedCount} workspaces`);

    console.log('\n✅ All jobs cleaned successfully!');
    console.log('You can now trigger a fresh sync.');

    await notionSyncQueue.close();
    await documentIndexQueue.close();

    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning jobs:', error);
    logger.error('Error cleaning jobs:', error);
    process.exit(1);
  }
}

cleanAllJobs();
