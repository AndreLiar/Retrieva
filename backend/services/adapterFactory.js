/**
 * Factory for creating authenticated document source adapters
 * Centralizes adapter creation and authentication
 */

import { NotionAdapter } from '../adapters/NotionAdapter.js';
import logger from '../config/logger.js';

/**
 * Create an authenticated Notion adapter for a workspace
 * @param {Object} workspace - NotionWorkspace document with getDecryptedToken method
 * @returns {Promise<NotionAdapter>} - Authenticated adapter instance
 */
export async function createAuthenticatedNotionAdapter(workspace) {
  const adapter = new NotionAdapter();
  const accessToken = workspace.getDecryptedToken();
  await adapter.authenticate(accessToken);

  logger.debug('Created authenticated Notion adapter', {
    service: 'adapterFactory',
    workspaceId: workspace.workspaceId,
  });

  return adapter;
}

/**
 * Create adapter with error handling wrapper
 * @param {Object} workspace - NotionWorkspace document
 * @returns {Promise<NotionAdapter>} - Authenticated adapter instance
 * @throws {Error} - If authentication fails
 */
export async function createAdapterWithRetry(workspace, maxRetries = 2) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await createAuthenticatedNotionAdapter(workspace);
    } catch (error) {
      lastError = error;
      logger.warn('Adapter authentication failed, retrying', {
        service: 'adapterFactory',
        workspaceId: workspace.workspaceId,
        attempt,
        maxRetries,
        error: error.message,
      });

      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
}
