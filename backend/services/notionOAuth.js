import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';
import { z } from 'zod';
import logger from '../config/logger.js';
import { generateToken } from '../utils/security/crypto.js';

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
  getAuthorizationUrl(userId, _redirectUrl = null) {
    try {
      // Generate random state for CSRF protection
      const state = generateToken(16);

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

  /**
   * SECURITY FIX: Verify Notion webhook signature
   * Notion signs webhook payloads using HMAC-SHA256 with the signing secret.
   * The signature is sent in the 'X-Notion-Signature' header.
   *
   * @param {string|Buffer} payload - Raw request body
   * @param {string} signature - Signature from X-Notion-Signature header
   * @param {string} signingSecret - Webhook signing secret from Notion
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(payload, signature, signingSecret = process.env.NOTION_WEBHOOK_SECRET) {
    if (!signingSecret) {
      logger.error('NOTION_WEBHOOK_SECRET not configured for webhook verification');
      return false;
    }

    if (!signature) {
      logger.warn('Missing X-Notion-Signature header in webhook request');
      return false;
    }

    try {
      // Notion uses HMAC-SHA256 for signing
      const expectedSignature = crypto
        .createHmac('sha256', signingSecret)
        .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      if (signatureBuffer.length !== expectedBuffer.length) {
        logger.warn('Webhook signature length mismatch');
        return false;
      }

      const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

      if (!isValid) {
        logger.warn('Invalid webhook signature', {
          receivedLength: signature.length,
          expectedLength: expectedSignature.length,
        });
      }

      return isValid;
    } catch (error) {
      logger.error('Webhook signature verification error', { error: error.message });
      return false;
    }
  }

  /**
   * SECURITY FIX: Verify webhook with timestamp to prevent replay attacks
   * Notion includes a timestamp in webhooks that should be checked.
   *
   * @param {Object} webhookBody - Parsed webhook body
   * @param {number} maxAgeSeconds - Maximum age of webhook in seconds (default 5 minutes)
   * @returns {boolean} True if webhook is fresh enough
   */
  verifyWebhookTimestamp(webhookBody, maxAgeSeconds = 300) {
    const timestamp = webhookBody?.timestamp || webhookBody?.created_time;

    if (!timestamp) {
      logger.warn('Missing timestamp in webhook body');
      return false;
    }

    const webhookTime = new Date(timestamp).getTime();
    const now = Date.now();
    const ageSeconds = (now - webhookTime) / 1000;

    if (ageSeconds > maxAgeSeconds) {
      logger.warn('Webhook timestamp too old (potential replay attack)', {
        ageSeconds,
        maxAgeSeconds,
      });
      return false;
    }

    if (ageSeconds < -60) {
      // Allow 60 seconds clock skew
      logger.warn('Webhook timestamp in the future (clock skew or manipulation)', {
        ageSeconds,
      });
      return false;
    }

    return true;
  }

  /**
   * SECURITY FIX: Complete webhook verification
   * Verifies both signature and timestamp for a Notion webhook.
   *
   * @param {string|Buffer} rawBody - Raw request body (before JSON parsing)
   * @param {string} signature - X-Notion-Signature header value
   * @param {Object} parsedBody - Parsed JSON body (for timestamp check)
   * @returns {Object} { valid: boolean, error?: string }
   */
  verifyWebhook(rawBody, signature, parsedBody) {
    // Verify signature
    if (!this.verifyWebhookSignature(rawBody, signature)) {
      return { valid: false, error: 'Invalid webhook signature' };
    }

    // Verify timestamp (prevents replay attacks)
    if (!this.verifyWebhookTimestamp(parsedBody)) {
      return { valid: false, error: 'Webhook timestamp validation failed' };
    }

    logger.info('Webhook verification successful');
    return { valid: true };
  }
}

// Export singleton instance
export const notionOAuthService = new NotionOAuthService();

export default notionOAuthService;
