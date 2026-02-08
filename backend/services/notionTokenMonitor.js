/**
 * Notion Token Health Monitor
 *
 * Monitors Notion OAuth tokens for validity and notifies users when tokens
 * become invalid. Provides options for auto-reconnect or manual intervention.
 *
 * @module services/notionTokenMonitor
 */

import axios from 'axios';
import logger from '../config/logger.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { User } from '../models/User.js';
import { decrypt } from '../utils/security/encryption.js';
import { emailService } from './emailService.js';

/**
 * Token health status enum
 */
export const TokenStatus = {
  VALID: 'valid',
  EXPIRED: 'expired',
  INVALID: 'invalid',
  REVOKED: 'revoked',
  UNKNOWN: 'unknown',
};

/**
 * Token monitor configuration
 */
const CONFIG = {
  // Check interval: every 6 hours by default
  checkIntervalMs: parseInt(process.env.TOKEN_CHECK_INTERVAL_HOURS || '6', 10) * 60 * 60 * 1000,
  // Notify user X days before potential issues
  warningDaysBeforeExpiry: 7,
  // Max retries before marking token as invalid
  maxValidationRetries: 3,
  // Retry delay in ms
  retryDelayMs: 5000,
  // Enable auto-reconnect attempt (requires stored refresh strategy)
  enableAutoReconnect: process.env.NOTION_AUTO_RECONNECT === 'true',
  // Enable email notifications
  enableEmailNotifications: process.env.NOTION_TOKEN_EMAIL_NOTIFICATIONS !== 'false',
};

/**
 * Notion Token Monitor Service
 */
class NotionTokenMonitor {
  constructor() {
    this.checkInterval = null;
    this.isRunning = false;
  }

  /**
   * Start the token monitoring service
   */
  start() {
    if (this.isRunning) {
      logger.warn('Token monitor already running');
      return;
    }

    logger.info('Starting Notion token health monitor', {
      service: 'notion-token-monitor',
      checkIntervalHours: CONFIG.checkIntervalMs / (60 * 60 * 1000),
      autoReconnect: CONFIG.enableAutoReconnect,
      emailNotifications: CONFIG.enableEmailNotifications,
    });

    // Run initial check
    this.checkAllTokens().catch((err) => {
      logger.error('Initial token check failed', {
        service: 'notion-token-monitor',
        error: err.message,
      });
    });

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllTokens().catch((err) => {
        logger.error('Scheduled token check failed', {
          service: 'notion-token-monitor',
          error: err.message,
        });
      });
    }, CONFIG.checkIntervalMs);

    this.isRunning = true;
  }

  /**
   * Stop the token monitoring service
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info('Notion token monitor stopped');
  }

  /**
   * Check all workspace tokens
   */
  async checkAllTokens() {
    const startTime = Date.now();
    logger.info('Starting token health check for all workspaces', {
      service: 'notion-token-monitor',
    });

    try {
      // Find all active workspaces with access tokens
      const workspaces = await NotionWorkspace.find({
        accessToken: { $exists: true, $ne: null },
        isActive: { $ne: false },
      }).lean();

      logger.info(`Found ${workspaces.length} workspaces to check`, {
        service: 'notion-token-monitor',
      });

      const results = {
        total: workspaces.length,
        valid: 0,
        invalid: 0,
        errors: 0,
      };

      for (const workspace of workspaces) {
        try {
          const status = await this.validateWorkspaceToken(workspace);
          if (status === TokenStatus.VALID) {
            results.valid++;
          } else {
            results.invalid++;
            await this.handleInvalidToken(workspace, status);
          }
        } catch (error) {
          results.errors++;
          logger.error('Error checking workspace token', {
            service: 'notion-token-monitor',
            workspaceId: workspace._id,
            error: error.message,
          });
        }
      }

      logger.info('Token health check completed', {
        service: 'notion-token-monitor',
        results,
        durationMs: Date.now() - startTime,
      });

      return results;
    } catch (error) {
      logger.error('Failed to check tokens', {
        service: 'notion-token-monitor',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validate a single workspace token
   * @param {Object} workspace - Workspace document
   * @returns {Promise<string>} Token status
   */
  async validateWorkspaceToken(workspace) {
    let retries = 0;
    let lastError = null;

    while (retries < CONFIG.maxValidationRetries) {
      try {
        // Decrypt the access token
        const accessToken = decrypt(workspace.accessToken);

        // Test the token by fetching user info from Notion API
        const response = await axios.get('https://api.notion.com/v1/users/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Notion-Version': '2022-06-28',
          },
          timeout: 10000,
        });

        if (response.status === 200) {
          // Update last validated time
          await NotionWorkspace.updateOne(
            { _id: workspace._id },
            {
              $set: {
                tokenLastValidated: new Date(),
                tokenStatus: TokenStatus.VALID,
                tokenValidationErrors: 0,
              },
            }
          );

          logger.debug('Token validated successfully', {
            service: 'notion-token-monitor',
            workspaceId: workspace._id,
            workspaceName: workspace.workspaceName,
          });

          return TokenStatus.VALID;
        }
      } catch (error) {
        lastError = error;
        retries++;

        if (error.response) {
          const status = error.response.status;
          const errorCode = error.response.data?.code;

          // Handle specific Notion API errors
          if (status === 401) {
            if (errorCode === 'unauthorized' || errorCode === 'invalid_token') {
              return TokenStatus.EXPIRED;
            }
            if (errorCode === 'restricted_resource') {
              return TokenStatus.REVOKED;
            }
          }

          if (status === 403) {
            return TokenStatus.REVOKED;
          }

          // Don't retry for client errors (4xx)
          if (status >= 400 && status < 500) {
            return TokenStatus.INVALID;
          }
        }

        // Retry for network/server errors
        if (retries < CONFIG.maxValidationRetries) {
          await new Promise((resolve) => setTimeout(resolve, CONFIG.retryDelayMs));
        }
      }
    }

    logger.warn('Token validation failed after retries', {
      service: 'notion-token-monitor',
      workspaceId: workspace._id,
      error: lastError?.message,
    });

    return TokenStatus.UNKNOWN;
  }

  /**
   * Handle an invalid token
   * @param {Object} workspace - Workspace document
   * @param {string} status - Token status
   */
  async handleInvalidToken(workspace, status) {
    logger.warn('Invalid token detected', {
      service: 'notion-token-monitor',
      workspaceId: workspace._id,
      workspaceName: workspace.workspaceName,
      status,
    });

    // Update workspace status
    await NotionWorkspace.updateOne(
      { _id: workspace._id },
      {
        $set: {
          tokenStatus: status,
          tokenInvalidatedAt: new Date(),
          syncStatus: 'token_expired',
        },
        $inc: {
          tokenValidationErrors: 1,
        },
      }
    );

    // Get the workspace owner
    const user = await User.findById(workspace.userId).lean();
    if (!user) {
      logger.warn('Could not find user for workspace', {
        service: 'notion-token-monitor',
        workspaceId: workspace._id,
      });
      return;
    }

    // Determine action based on user preference
    const userPreference = user.notionTokenPreference || 'notify';

    if (userPreference === 'auto_reconnect' && CONFIG.enableAutoReconnect) {
      // Attempt auto-reconnect (would require refresh token mechanism)
      // Notion OAuth doesn't support refresh tokens, so this is mainly a placeholder
      // for future OAuth flows that might support it
      logger.info('Auto-reconnect not available for Notion OAuth', {
        service: 'notion-token-monitor',
        workspaceId: workspace._id,
      });
      // Fall back to notification
      await this.notifyUserTokenExpired(user, workspace, status);
    } else {
      // Notify user to manually reconnect
      await this.notifyUserTokenExpired(user, workspace, status);
    }
  }

  /**
   * Notify user that their token has expired
   * @param {Object} user - User document
   * @param {Object} workspace - Workspace document
   * @param {string} status - Token status
   */
  async notifyUserTokenExpired(user, workspace, status) {
    if (!CONFIG.enableEmailNotifications) {
      logger.info('Email notifications disabled, skipping', {
        service: 'notion-token-monitor',
      });
      return;
    }

    const statusMessages = {
      [TokenStatus.EXPIRED]: 'Your Notion access token has expired.',
      [TokenStatus.REVOKED]:
        'Your Notion integration access has been revoked. This may happen if you removed the integration from your Notion workspace.',
      [TokenStatus.INVALID]:
        'Your Notion access token is no longer valid. This may be due to a configuration change.',
      [TokenStatus.UNKNOWN]:
        'We were unable to verify your Notion connection. Please check your integration settings.',
    };

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const reconnectUrl = `${frontendUrl}/settings/integrations?action=reconnect&workspace=${workspace._id}`;

    const emailContent = {
      to: user.email,
      subject: `Action Required: Reconnect Your Notion Workspace "${workspace.workspaceName}"`,
      html: `
        <h2>Notion Connection Issue</h2>
        <p>Hello ${user.name || 'there'},</p>
        <p>${statusMessages[status] || statusMessages[TokenStatus.UNKNOWN]}</p>
        <p><strong>Workspace:</strong> ${workspace.workspaceName}</p>
        <p>To continue syncing your Notion content, please reconnect your workspace:</p>
        <p style="margin: 20px 0;">
          <a href="${reconnectUrl}" style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Reconnect Notion
          </a>
        </p>
        <p>Or follow these steps:</p>
        <ol>
          <li>Go to Settings → Integrations in the app</li>
          <li>Click "Disconnect" next to "${workspace.workspaceName}"</li>
          <li>Click "Connect Notion" to authorize again</li>
        </ol>
        <p>If you have any questions, please contact support.</p>
        <p>Best regards,<br>The RAG Platform Team</p>
      `,
      text: `
Notion Connection Issue

Hello ${user.name || 'there'},

${statusMessages[status] || statusMessages[TokenStatus.UNKNOWN]}

Workspace: ${workspace.workspaceName}

To continue syncing your Notion content, please reconnect your workspace:
${reconnectUrl}

Or follow these steps:
1. Go to Settings → Integrations in the app
2. Click "Disconnect" next to "${workspace.workspaceName}"
3. Click "Connect Notion" to authorize again

If you have any questions, please contact support.

Best regards,
The RAG Platform Team
      `,
    };

    try {
      await emailService.sendEmail(emailContent);
      logger.info('Token expiration notification sent', {
        service: 'notion-token-monitor',
        userId: user._id,
        workspaceId: workspace._id,
        email: user.email,
      });

      // Record that we sent the notification
      await NotionWorkspace.updateOne(
        { _id: workspace._id },
        {
          $set: {
            lastTokenExpirationNotice: new Date(),
          },
        }
      );
    } catch (error) {
      logger.error('Failed to send token expiration notification', {
        service: 'notion-token-monitor',
        userId: user._id,
        error: error.message,
      });
    }
  }

  /**
   * Check a single workspace token (for on-demand checks)
   * @param {string} workspaceId - MongoDB workspace ID
   * @returns {Promise<Object>} Validation result
   */
  async checkWorkspace(workspaceId) {
    const workspace = await NotionWorkspace.findById(workspaceId).lean();
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const status = await this.validateWorkspaceToken(workspace);
    return {
      workspaceId,
      workspaceName: workspace.workspaceName,
      status,
      lastValidated: workspace.tokenLastValidated,
      isValid: status === TokenStatus.VALID,
    };
  }

  /**
   * Get token health status for all user workspaces
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of workspace token statuses
   */
  async getUserTokenHealth(userId) {
    const workspaces = await NotionWorkspace.find({
      userId,
      accessToken: { $exists: true, $ne: null },
    })
      .select('workspaceName tokenStatus tokenLastValidated tokenInvalidatedAt syncStatus')
      .lean();

    return workspaces.map((ws) => ({
      workspaceId: ws._id,
      workspaceName: ws.workspaceName,
      tokenStatus: ws.tokenStatus || TokenStatus.UNKNOWN,
      lastValidated: ws.tokenLastValidated,
      invalidatedAt: ws.tokenInvalidatedAt,
      syncStatus: ws.syncStatus,
      needsReconnect: [TokenStatus.EXPIRED, TokenStatus.REVOKED, TokenStatus.INVALID].includes(
        ws.tokenStatus
      ),
    }));
  }
}

// Singleton instance
export const notionTokenMonitor = new NotionTokenMonitor();

export default NotionTokenMonitor;
