/**
 * Audit Trail Middleware
 *
 * GUARDRAIL: Automatically log all requests for compliance
 * - Captures request/response details
 * - Sanitizes sensitive data
 * - Tracks guardrails triggered
 * - Measures latency
 * @module middleware/auditTrail
 */

import { randomUUID } from 'crypto';
import { AuditLog } from '../models/AuditLog.js';
import logger from '../config/logger.js';
import { guardrailsConfig } from '../config/guardrails.js';

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

/**
 * @typedef {Object} AuditMiddlewareOptions
 * @property {string[]} [excludePaths=[]] - Paths to exclude from auditing
 * @property {boolean} [includeBody=true] - Whether to include request body
 */

/**
 * @typedef {Object} AuditTarget
 * @property {'conversation'|'workspace'|'user'|'document'|'member'|'system'} type - Target type
 * @property {string} id - Target ID
 * @property {string} [name] - Target name
 */

/**
 * @typedef {Object} AuditedRequest
 * @property {string} requestId - Unique request ID
 * @property {string[]} [guardrailsTriggered] - Guardrails that were triggered
 * @property {boolean} [guardrailsBlocked] - Whether request was blocked
 * @property {string[]} [guardrailsWarnings] - Warning messages
 * @property {boolean} [piiDetected] - Whether PII was detected
 * @property {string} [workspaceId] - Related workspace ID
 */

// Action type mapping from endpoint
const endpointActionMap = {
  'POST /api/v1/rag': 'rag_query',
  'POST /api/v1/rag/stream': 'rag_stream',
  'POST /api/v1/conversations': 'conversation_create',
  'GET /api/v1/conversations': 'conversation_read',
  'GET /api/v1/conversations/:id': 'conversation_read',
  'PATCH /api/v1/conversations/:id': 'conversation_update',
  'DELETE /api/v1/conversations/:id': 'conversation_delete',
  'GET /api/v1/notion/auth': 'workspace_connect',
  'GET /api/v1/notion/callback': 'workspace_connect',
  'POST /api/v1/notion/workspaces/:id/sync': 'workspace_sync',
  'PATCH /api/v1/notion/workspaces/:id': 'workspace_settings_update',
  'DELETE /api/v1/notion/workspaces/:id': 'workspace_disconnect',
  'POST /api/v1/notion/workspaces/:id/disconnect': 'workspace_disconnect',
  'POST /api/v1/workspaces/:workspaceId/invite': 'member_invite',
  'DELETE /api/v1/workspaces/:workspaceId/members/:userId': 'member_remove',
  'PATCH /api/v1/workspaces/:workspaceId/members/:userId': 'member_update',
  'POST /api/v1/auth/login': 'auth_login',
  'POST /api/v1/auth/logout': 'auth_logout',
  'POST /api/v1/auth/refresh': 'auth_refresh',
  'DELETE /api/v1/cache': 'cache_clear',
};

/**
 * Get action type from request method and path
 * Maps endpoint patterns to audit action types
 *
 * @param {Request} req - Express request object
 * @returns {string} Action type for audit log
 * @private
 */
function getActionType(req) {
  const method = req.method;
  const path = req.route?.path || req.path;
  const basePath = req.baseUrl || '';

  // Try exact match first
  const fullPath = `${method} ${basePath}${path}`;
  if (endpointActionMap[fullPath]) {
    return endpointActionMap[fullPath];
  }

  // Try pattern matching
  for (const [pattern, action] of Object.entries(endpointActionMap)) {
    const [pMethod, pPath] = pattern.split(' ');
    if (method === pMethod) {
      const regex = new RegExp('^' + pPath.replace(/:[^/]+/g, '[^/]+') + '$');
      if (regex.test(`${basePath}${path}`)) {
        return action;
      }
    }
  }

  // Default based on method
  return `${method.toLowerCase()}_request`;
}

/**
 * Get target information from request parameters
 *
 * @param {Request} req - Express request object
 * @returns {AuditTarget|null} Target info or null if not applicable
 * @private
 */
function getTarget(req) {
  if (req.params?.id || req.params?.conversationId) {
    return {
      type: 'conversation',
      id: req.params.id || req.params.conversationId,
    };
  }

  if (req.params?.workspaceId) {
    return {
      type: 'workspace',
      id: req.params.workspaceId,
    };
  }

  if (req.params?.userId) {
    return {
      type: 'user',
      id: req.params.userId,
    };
  }

  return null;
}

/**
 * Create audit log middleware factory
 * Returns middleware that logs all requests for compliance
 *
 * @param {AuditMiddlewareOptions} [options={}] - Configuration options
 * @returns {function(Request, Response, NextFunction): void} Express middleware
 */
export function createAuditMiddleware(options = {}) {
  const { excludePaths = [], includeBody = true } = options;

  return async (req, res, next) => {
    // Skip excluded paths
    if (excludePaths.some((p) => req.path.startsWith(p))) {
      return next();
    }

    // Generate request ID if not present
    req.requestId = req.requestId || req.headers['x-request-id'] || randomUUID();
    const startTime = Date.now();

    // Capture original end to intercept response
    const originalEnd = res.end;
    let responseBody = null;

    res.end = function (chunk, encoding) {
      // Try to capture response body for metadata
      if (chunk) {
        try {
          const body = chunk.toString();
          if (body.startsWith('{')) {
            responseBody = JSON.parse(body);
          }
        } catch {
          // Ignore parse errors
        }
      }

      res.end = originalEnd;
      res.end(chunk, encoding);

      // Log asynchronously after response is sent
      logAuditEntry(req, res, responseBody, startTime).catch((err) => {
        logger.error('Failed to create audit log', {
          service: 'audit',
          error: err.message,
          requestId: req.requestId,
        });
      });
    };

    next();
  };
}

/**
 * Log audit entry after request completes
 * Called asynchronously after response is sent
 *
 * @param {Request & AuditedRequest} req - Express request with audit info
 * @param {Response} res - Express response object
 * @param {Object|null} responseBody - Parsed response body
 * @param {number} startTime - Request start timestamp
 * @returns {Promise<void>}
 * @private
 */
async function logAuditEntry(req, res, responseBody, startTime) {
  if (!guardrailsConfig.monitoring.auditTrail.enabled) {
    return;
  }

  const latencyMs = Date.now() - startTime;

  try {
    const auditData = {
      requestId: req.requestId,
      timestamp: new Date(),

      // Actor information
      actor: {
        type: req.user ? 'user' : req.apiKey ? 'api_key' : 'anonymous',
        userId: req.user?.userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        sessionId: req.sessionID,
      },

      // Action information
      action: {
        type: getActionType(req),
        endpoint: `${req.method} ${req.originalUrl}`,
        method: req.method,
      },

      // Target
      target: getTarget(req),

      // Request details (sanitized)
      request: {
        question: req.body?.question,
        filters: req.body?.filters,
        body: req.body,
      },

      // Response details
      response: {
        statusCode: res.statusCode,
        success: res.statusCode >= 200 && res.statusCode < 400,
        answerLength: responseBody?.data?.answer?.length,
        confidence: responseBody?.data?.validation?.confidence,
        sourcesCount: responseBody?.data?.sources?.length,
        latencyMs,
        tokensUsed: responseBody?.data?.tokens,
      },

      // Guardrails
      guardrails: {
        triggered: req.guardrailsTriggered || [],
        blocked: req.guardrailsBlocked || false,
        warnings: req.guardrailsWarnings || [],
      },

      // Context
      workspaceId: req.workspaceId || req.body?.workspaceId,
      conversationId: req.params?.id || req.body?.conversationId,

      // Compliance
      compliance: {
        dataClassification: 'internal',
        piiDetected: req.piiDetected || false,
        region: getRegion(req),
      },
    };

    await AuditLog.log(auditData);

    logger.debug('Audit log created', {
      service: 'audit',
      requestId: req.requestId,
      action: auditData.action.type,
      latencyMs,
    });
  } catch (error) {
    logger.error('Failed to create audit log', {
      service: 'audit',
      error: error.message,
      requestId: req.requestId,
    });
  }
}

/**
 * Extract geographic region from request headers
 * Checks Cloudflare and other CDN headers
 *
 * @param {Request} req - Express request object
 * @returns {string} Country code or 'unknown'
 * @private
 */
function getRegion(req) {
  // Check for Cloudflare header
  const cfCountry = req.headers['cf-ipcountry'];
  if (cfCountry) return cfCountry;

  // Check for other CDN headers
  const xCountry = req.headers['x-country-code'];
  if (xCountry) return xCountry;

  return 'unknown';
}

/**
 * Track guardrail trigger in request for audit logging
 *
 * @param {Request & AuditedRequest} req - Express request object
 * @param {string} guardrailName - Name of triggered guardrail
 * @param {boolean} [blocked=false] - Whether the guardrail blocked the request
 */
export function trackGuardrailTrigger(req, guardrailName, blocked = false) {
  if (!req.guardrailsTriggered) {
    req.guardrailsTriggered = [];
  }
  req.guardrailsTriggered.push(guardrailName);

  if (blocked) {
    req.guardrailsBlocked = true;
  }
}

/**
 * Add guardrail warning to request for audit logging
 *
 * @param {Request & AuditedRequest} req - Express request object
 * @param {string} warning - Warning message
 */
export function addGuardrailWarning(req, warning) {
  if (!req.guardrailsWarnings) {
    req.guardrailsWarnings = [];
  }
  req.guardrailsWarnings.push(warning);
}

/**
 * Get audit logs endpoint handler
 * Query parameters: userId, workspaceId, actionType, hours (default 24), limit (default 100)
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<void>}
 */
export async function getAuditLogs(req, res) {
  try {
    const { userId, workspaceId, actionType, hours = 24, limit = 100 } = req.query;

    let logs;
    const options = {
      limit: Math.min(parseInt(limit) || 100, 500),
      startDate: new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000),
    };

    if (userId) {
      logs = await AuditLog.getForUser(userId, options);
    } else if (workspaceId) {
      logs = await AuditLog.getForWorkspace(workspaceId, options);
    } else {
      // General query
      const query = { timestamp: { $gte: options.startDate } };
      if (actionType) query['action.type'] = actionType;

      logs = await AuditLog.find(query).sort({ timestamp: -1 }).limit(options.limit);
    }

    res.json({
      status: 'success',
      data: {
        logs,
        count: logs.length,
        periodHours: parseInt(hours),
      },
    });
  } catch (error) {
    logger.error('Failed to get audit logs', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve audit logs',
    });
  }
}

/**
 * Get audit summary endpoint handler
 * Query parameters: hours (default 24)
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Promise<void>}
 */
export async function getAuditSummary(req, res) {
  try {
    const { hours = 24 } = req.query;

    const [summary, guardrailTriggers] = await Promise.all([
      AuditLog.getSummary(parseInt(hours)),
      AuditLog.getGuardrailTriggers(parseInt(hours)),
    ]);

    res.json({
      status: 'success',
      data: {
        summary,
        guardrailTriggers: guardrailTriggers.slice(0, 20),
        periodHours: parseInt(hours),
      },
    });
  } catch (error) {
    logger.error('Failed to get audit summary', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve audit summary',
    });
  }
}
