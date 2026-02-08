/**
 * Webhook Signature Verification Middleware
 *
 * SECURITY: Verifies webhook signatures to prevent:
 * - Spoofed webhook requests
 * - Replay attacks (via timestamp verification)
 * - CSRF attacks on webhook endpoints
 */

import { notionOAuthService } from '../services/notionOAuth.js';
import logger from '../config/logger.js';
import { sendError } from '../utils/index.js';

/**
 * Store raw body for webhook signature verification
 * Must be used BEFORE body-parser middlewares
 *
 * Usage in app.js:
 * app.use('/api/v1/webhooks', storeRawBody);
 * app.use(express.json());
 */
export function storeRawBody(req, res, next) {
  let data = '';

  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    data += chunk;
  });

  req.on('end', () => {
    req.rawBody = data;
    // Also parse JSON for convenience
    try {
      req.body = JSON.parse(data);
    } catch {
      req.body = {};
    }
    next();
  });
}

/**
 * Verify Notion webhook signature middleware
 *
 * Expects:
 * - X-Notion-Signature header with HMAC signature
 * - Raw body available in req.rawBody
 * - NOTION_WEBHOOK_SECRET environment variable set
 *
 * Usage:
 * router.post('/notion/webhook', verifyNotionWebhook, handleNotionWebhook);
 */
export function verifyNotionWebhook(req, res, next) {
  const signature = req.headers['x-notion-signature'];
  const rawBody = req.rawBody;

  if (!rawBody) {
    logger.error('Raw body not available for webhook verification. Use storeRawBody middleware.');
    return sendError(res, 500, 'Server configuration error');
  }

  const result = notionOAuthService.verifyWebhook(rawBody, signature, req.body);

  if (!result.valid) {
    logger.warn('Notion webhook verification failed', {
      error: result.error,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return sendError(res, 401, 'Invalid webhook signature');
  }

  next();
}

/**
 * Generic webhook signature verification middleware factory
 * Creates a middleware for any webhook provider using HMAC verification
 *
 * @param {Object} options Configuration options
 * @param {string} options.secretEnvVar - Environment variable name for the secret
 * @param {string} options.signatureHeader - Header name containing the signature
 * @param {string} options.algorithm - HMAC algorithm (default: sha256)
 * @param {string} options.encoding - Signature encoding (default: hex)
 * @param {string} options.prefix - Signature prefix to strip (e.g., 'sha256=')
 * @returns {Function} Express middleware
 */
export function createWebhookVerifier(options) {
  const {
    secretEnvVar,
    signatureHeader,
    algorithm = 'sha256',
    encoding = 'hex',
    prefix = '',
  } = options;

  return function webhookVerifier(req, res, next) {
    const secret = process.env[secretEnvVar];
    if (!secret) {
      logger.error(`${secretEnvVar} not configured for webhook verification`);
      return sendError(res, 500, 'Webhook verification not configured');
    }

    let signature = req.headers[signatureHeader.toLowerCase()];
    if (!signature) {
      logger.warn(`Missing ${signatureHeader} header in webhook request`);
      return sendError(res, 401, 'Missing webhook signature');
    }

    // Strip prefix if present (e.g., 'sha256=' for GitHub)
    if (prefix && signature.startsWith(prefix)) {
      signature = signature.slice(prefix.length);
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      logger.error('Raw body not available. Use storeRawBody middleware before this.');
      return sendError(res, 500, 'Server configuration error');
    }

    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac(algorithm, secret)
        .update(rawBody)
        .digest(encoding);

      const signatureBuffer = Buffer.from(signature, encoding);
      const expectedBuffer = Buffer.from(expectedSignature, encoding);

      if (signatureBuffer.length !== expectedBuffer.length) {
        logger.warn('Webhook signature length mismatch');
        return sendError(res, 401, 'Invalid webhook signature');
      }

      const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

      if (!isValid) {
        logger.warn('Webhook signature verification failed', {
          ip: req.ip,
          path: req.path,
        });
        return sendError(res, 401, 'Invalid webhook signature');
      }

      logger.info('Webhook signature verified successfully', { path: req.path });
      next();
    } catch (error) {
      logger.error('Webhook signature verification error', { error: error.message });
      return sendError(res, 500, 'Signature verification error');
    }
  };
}

/**
 * Pre-configured webhook verifiers for common providers
 */
export const webhookVerifiers = {
  // GitHub webhook verification
  github: createWebhookVerifier({
    secretEnvVar: 'GITHUB_WEBHOOK_SECRET',
    signatureHeader: 'X-Hub-Signature-256',
    algorithm: 'sha256',
    encoding: 'hex',
    prefix: 'sha256=',
  }),

  // Stripe webhook verification
  stripe: createWebhookVerifier({
    secretEnvVar: 'STRIPE_WEBHOOK_SECRET',
    signatureHeader: 'Stripe-Signature',
    algorithm: 'sha256',
    encoding: 'hex',
    prefix: '',
  }),

  // Slack webhook verification
  slack: createWebhookVerifier({
    secretEnvVar: 'SLACK_SIGNING_SECRET',
    signatureHeader: 'X-Slack-Signature',
    algorithm: 'sha256',
    encoding: 'hex',
    prefix: 'v0=',
  }),
};

export default {
  storeRawBody,
  verifyNotionWebhook,
  createWebhookVerifier,
  webhookVerifiers,
};
