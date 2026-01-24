import 'dotenv/config';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { syncScheduler } from './syncScheduler.js';
import logger from '../config/logger.js';

const DEFAULT_USER_ID = 'default-user';

/**
 * Startup Initialization Service
 * Automatically initializes existing Notion workspace connections on startup
 */
export class StartupInitService {
  /**
   * Initialize existing Notion workspace connections on startup
   */
  async initializeNotionWorkspace() {
    try {
      // Check for existing workspace
      const workspace = await NotionWorkspace.findOne({
        userId: DEFAULT_USER_ID,
        syncStatus: { $ne: 'paused' }, // Skip paused workspaces
      });

      if (!workspace) {
        logger.info('═══════════════════════════════════════════════════════════');
        logger.info('No Notion workspace connected');
        logger.info('To connect your Notion workspace:');
        logger.info('  1. Open: http://localhost:3007/api/v1/notion/auth');
        logger.info('  2. Authorize in your browser');
        logger.info('  3. Restart the backend to auto-initialize');
        logger.info('═══════════════════════════════════════════════════════════');
        return;
      }

      logger.info('═══════════════════════════════════════════════════════════');
      logger.info('✓ Notion workspace connected', {
        workspaceId: workspace.workspaceId,
        workspaceName: workspace.workspaceName,
        syncStatus: workspace.syncStatus,
        lastSyncAt: workspace.lastSyncAt,
      });

      // Ensure sync schedule is active
      await syncScheduler.scheduleWorkspaceSync(workspace.workspaceId);
      logger.info('✓ Sync schedule initialized', {
        workspaceId: workspace.workspaceId,
        intervalHours: workspace.syncSettings.syncIntervalHours,
      });

      logger.info('═══════════════════════════════════════════════════════════');
    } catch (error) {
      logger.error('Failed to initialize Notion workspace', {
        error: error.message,
        stack: error.stack,
      });

      // Don't throw - allow the app to start even if initialization fails
      logger.warn('Application will continue - you can manually sync via API');
    }
  }

  /**
   * Run all startup initializations
   */
  async initialize() {
    logger.info('Running startup initialization...');

    await this.initializeNotionWorkspace();

    logger.info('Startup initialization complete');
  }
}

// Export singleton instance
export const startupInitService = new StartupInitService();
export default startupInitService;
