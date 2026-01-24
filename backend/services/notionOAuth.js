import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';
import { z } from 'zod';
import logger from '../config/logger.js';

/**
 * SECURITY FIX (API10:2023): Schema validation for Notion OAuth token response
 * Validates external API responses before trusting the data
 */
const notionTokenResponseSchema = z.object({
  access_token: z.string().min(1, 'Missing access_token'),
  workspace_id: z.string().min(1, 'Missing workspace_id'),
  workspace_name: z.string().optional().nullable(),
  workspace_icon: z.string().optional().nullable(),
  bot_id: z.string().min(1, 'Missing bot_id'),
  owner: z
    .object({
      type: z.string(),
      user: z
        .object({
          id: z.string(),
          name: z.string().optional().nullable(),
          avatar_url: z.string().optional().nullable(),
          type: z.string().optional(),
          person: z
            .object({
              email: z.string().optional().nullable(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  token_type: z.string().optional(),
  duplicated_template_id: z.string().optional().nullable(),
});

const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
const NOTION_REDIRECT_URI = process.env.NOTION_REDIRECT_URI;
const NOTION_AUTH_URL = process.env.NOTION_AUTH_URL || 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = process.env.NOTION_TOKEN_URL || 'https://api.notion.com/v1/oauth/token';

/**
 * Notion OAuth Service
 * Handles OAuth 2.0 flow for Notion integration
 */
export class NotionOAuthService {
  /**
   * Generate authorization URL for OAuth flow
   * @param {string} userId - User ID for state parameter
   * @param {string} redirectUrl - Optional custom redirect URL
   * @returns {Object} Authorization URL and state
   */
  getAuthorizationUrl(userId, redirectUrl = null) {
    try {
      // Generate random state for CSRF protection
      const state = crypto.randomBytes(16).toString('hex');

      // Store userId in state (you may want to use a more secure method like Redis)
      const stateData = JSON.stringify({ state, userId, timestamp: Date.now() });
      const encodedState = Buffer.from(stateData).toString('base64');

      const params = new URLSearchParams({
        client_id: NOTION_CLIENT_ID,
        response_type: 'code',
        owner: 'user',
        redirect_uri: NOTION_REDIRECT_URI,
        state: encodedState,
      });

      const authUrl = `${NOTION_AUTH_URL}?${params.toString()}`;

      logger.info(`Generated Notion OAuth URL for user: ${userId}`);
      return {
        authUrl,
        state: encodedState,
      };
    } catch (error) {
      logger.error('Failed to generate authorization URL:', error);
      throw error;
    }
  }

  /**
   * Validate state parameter from callback
   * @param {string} encodedState - Encoded state from callback
   * @param {number} maxAge - Maximum age in milliseconds (default 10 minutes)
   * @returns {Object} Decoded state data
   */
  validateState(encodedState, maxAge = 10 * 60 * 1000) {
    try {
      const stateData = JSON.parse(Buffer.from(encodedState, 'base64').toString('utf-8'));

      // Check if state is expired
      const age = Date.now() - stateData.timestamp;
      if (age > maxAge) {
        throw new Error('State parameter expired');
      }

      return stateData;
    } catch (error) {
      logger.error('State validation failed:', error);
      throw new Error('Invalid state parameter');
    }
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code from callback
   * @returns {Promise<Object>} Token response with access_token and workspace info
   */
  async exchangeCodeForToken(code) {
    try {
      const credentials = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString(
        'base64'
      );

      const response = await axios.post(
        NOTION_TOKEN_URL,
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: NOTION_REDIRECT_URI,
        },
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // SECURITY FIX (API10:2023): Validate external API response schema
      const parseResult = notionTokenResponseSchema.safeParse(response.data);
      if (!parseResult.success) {
        logger.error('Notion token response validation failed', {
          errors: parseResult.error.errors,
        });
        throw new Error('Invalid token response from Notion API');
      }

      const { access_token, workspace_id, workspace_name, workspace_icon, bot_id, owner } =
        parseResult.data;

      logger.info(
        `Successfully exchanged code for token. Workspace: ${workspace_name || 'unnamed'}`
      );

      return {
        accessToken: access_token,
        workspaceId: workspace_id,
        workspaceName: workspace_name,
        workspaceIcon: workspace_icon,
        botId: bot_id,
        owner,
      };
    } catch (error) {
      logger.error('Failed to exchange code for token:', error.response?.data || error.message);
      throw new Error(`Token exchange failed: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Validate access token by making a test request
   * @param {string} accessToken - Notion access token
   * @returns {Promise<boolean>} Validity status
   */
  async validateToken(accessToken) {
    try {
      await axios.get('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Notion-Version': '2022-06-28',
        },
      });

      logger.info('Access token validated successfully');
      return true;
    } catch (error) {
      logger.error('Token validation failed:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Revoke access token (if supported by Notion in the future)
   * Currently Notion doesn't provide a revoke endpoint
   * @param {string} accessToken - Token to revoke
   * @returns {Promise<boolean>}
   */
  async revokeToken(_accessToken) {
    // Notion doesn't currently support token revocation
    // User must revoke access through Notion UI
    logger.warn('Notion does not support programmatic token revocation');
    return false;
  }
}

// Export singleton instance
export const notionOAuthService = new NotionOAuthService();

export default notionOAuthService;
