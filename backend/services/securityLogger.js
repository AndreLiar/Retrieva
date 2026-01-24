/**
 * Security Event Logger Service
 *
 * GUARDRAIL: Centralized security event logging for:
 * - Authentication events
 * - Abuse detection
 * - Prompt injection attempts
 * - Rate limiting
 * - Unusual access patterns
 */

import mongoose from 'mongoose';
import logger from '../config/logger.js';
import { guardrailsConfig } from '../config/guardrails.js';

// In-memory event counter for threshold-based alerting
const eventCounters = new Map();

/**
 * Security Event Schema
 */
const securityEventSchema = new mongoose.Schema(
  {
    // Event identification
    eventType: {
      type: String,
      required: true,
      index: true,
      enum: [
        'auth_failed',
        'auth_success',
        'token_expired',
        'token_refresh',
        'rate_limit_exceeded',
        'prompt_injection_detected',
        'abuse_pattern_detected',
        'abuse_detection_blocked',
        'token_limit_exceeded',
        'unusual_access_pattern',
        'suspicious_query',
        'pii_detected',
        'guardrail_triggered',
        'config_change',
        'admin_action',
      ],
    },

    // Severity level
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },

    // Actor information
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    userEmail: String,
    ipAddress: String,
    userAgent: String,

    // Request context
    endpoint: String,
    method: String,
    requestId: String,

    // Event-specific data
    data: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Action taken
    action: {
      type: String,
      enum: ['logged', 'warned', 'blocked', 'flagged', 'alerted'],
      default: 'logged',
    },

    // Alert status
    alertSent: {
      type: Boolean,
      default: false,
    },
    alertSentAt: Date,

    timestamp: {
      type: Date,
      default: Date.now,
      // No index here - using TTL index below
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
securityEventSchema.index({ eventType: 1, timestamp: -1 });
securityEventSchema.index({ userId: 1, timestamp: -1 });
securityEventSchema.index({ severity: 1, timestamp: -1 });
securityEventSchema.index({ ipAddress: 1, timestamp: -1 });

// TTL index for automatic cleanup based on retention policy
const retentionDays = guardrailsConfig.monitoring.auditTrail.retentionDays;
securityEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

/**
 * Get events by type within a time window
 */
securityEventSchema.statics.getEventsByType = async function (eventType, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    eventType,
    timestamp: { $gte: since },
  }).sort({ timestamp: -1 });
};

/**
 * Get events for a specific user
 */
securityEventSchema.statics.getUserEvents = async function (userId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    userId,
    timestamp: { $gte: since },
  }).sort({ timestamp: -1 });
};

/**
 * Get event summary statistics
 */
securityEventSchema.statics.getSummary = async function (hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const summary = await this.aggregate([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: { eventType: '$eventType', severity: '$severity' },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.eventType',
        severityCounts: {
          $push: {
            severity: '$_id.severity',
            count: '$count',
          },
        },
        totalCount: { $sum: '$count' },
      },
    },
    { $sort: { totalCount: -1 } },
  ]);

  return summary;
};

/**
 * Get high-severity events requiring attention
 */
securityEventSchema.statics.getHighSeverityEvents = async function (hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    severity: { $in: ['high', 'critical'] },
    timestamp: { $gte: since },
  })
    .sort({ timestamp: -1 })
    .limit(100);
};

const SecurityEvent = mongoose.model('SecurityEvent', securityEventSchema);

/**
 * Severity mapping for event types
 */
const eventSeverityMap = {
  auth_failed: 'low',
  auth_success: 'low',
  token_expired: 'low',
  token_refresh: 'low',
  rate_limit_exceeded: 'medium',
  prompt_injection_detected: 'high',
  abuse_pattern_detected: 'high',
  abuse_detection_blocked: 'medium',
  token_limit_exceeded: 'medium',
  unusual_access_pattern: 'medium',
  suspicious_query: 'high',
  pii_detected: 'medium',
  guardrail_triggered: 'medium',
  config_change: 'high',
  admin_action: 'high',
};

/**
 * Log a security event
 * @param {string} eventType - Type of security event
 * @param {Object} data - Event-specific data
 * @param {Object} options - Additional options (userId, ipAddress, etc.)
 */
export async function logSecurityEvent(eventType, data = {}, options = {}) {
  try {
    const severity = options.severity || eventSeverityMap[eventType] || 'medium';

    const event = await SecurityEvent.create({
      eventType,
      severity,
      userId: options.userId || data.userId,
      userEmail: options.userEmail || data.userEmail,
      ipAddress: options.ipAddress || data.ip,
      userAgent: options.userAgent,
      endpoint: options.endpoint || data.endpoint,
      method: options.method,
      requestId: options.requestId,
      data,
      action: options.action || 'logged',
    });

    // Log to standard logger as well
    const logLevel = severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info';

    logger[logLevel](`Security event: ${eventType}`, {
      service: 'security',
      eventId: event._id,
      severity,
      ...data,
    });

    // Check if we should alert based on thresholds
    await checkAlertThreshold(eventType, event);

    return event;
  } catch (error) {
    logger.error('Failed to log security event', {
      service: 'security',
      eventType,
      error: error.message,
    });
  }
}

/**
 * Check if an event type has exceeded alert thresholds
 */
async function checkAlertThreshold(eventType, event) {
  const eventConfig = guardrailsConfig.monitoring.securityEvents[eventType.replace(/_/g, '')];

  if (!eventConfig) return;

  const key = `${eventType}:${event.ipAddress || event.userId || 'global'}`;
  const now = Date.now();

  if (!eventCounters.has(key)) {
    eventCounters.set(key, { count: 0, windowStart: now });
  }

  const counter = eventCounters.get(key);

  // Reset counter if window has passed
  if (now - counter.windowStart > eventConfig.window * 1000) {
    counter.count = 0;
    counter.windowStart = now;
  }

  counter.count++;

  if (counter.count >= eventConfig.threshold) {
    // Threshold exceeded - take action
    switch (eventConfig.action) {
      case 'alert':
      case 'log_and_alert':
        await sendAlert(eventType, event, counter.count);
        break;
      case 'flag':
        await flagForReview(eventType, event);
        break;
    }

    // Reset counter after action
    counter.count = 0;
  }
}

/**
 * Send alert (placeholder for actual alerting implementation)
 */
async function sendAlert(eventType, event, count) {
  logger.warn('SECURITY ALERT', {
    service: 'security',
    eventType,
    count,
    eventId: event._id,
    severity: event.severity,
  });

  // Update event to mark alert as sent
  await SecurityEvent.updateOne({ _id: event._id }, { alertSent: true, alertSentAt: new Date() });

  // TODO: Implement actual alerting (Slack, email, PagerDuty)
  // This would integrate with your alerting infrastructure
}

/**
 * Flag event for manual review
 */
async function flagForReview(eventType, event) {
  await SecurityEvent.updateOne(
    { _id: event._id },
    {
      action: 'flagged',
      'data.flaggedForReview': true,
      'data.flaggedAt': new Date(),
    }
  );

  logger.warn('Event flagged for review', {
    service: 'security',
    eventType,
    eventId: event._id,
  });
}

/**
 * Get security event model for direct queries
 */
export function getSecurityEventModel() {
  return SecurityEvent;
}

/**
 * Log authentication event
 */
export async function logAuthEvent(type, userId, data = {}) {
  return logSecurityEvent(type, data, {
    userId,
    action: type === 'auth_success' ? 'logged' : 'warned',
  });
}

/**
 * Log guardrail triggered event
 */
export async function logGuardrailTriggered(guardrailName, data = {}) {
  return logSecurityEvent(
    'guardrail_triggered',
    {
      guardrail: guardrailName,
      ...data,
    },
    {
      severity: 'medium',
      action: 'logged',
    }
  );
}

/**
 * Get security dashboard data
 */
export async function getSecurityDashboard(hours = 24) {
  const [summary, highSeverity, recentEvents] = await Promise.all([
    SecurityEvent.getSummary(hours),
    SecurityEvent.getHighSeverityEvents(hours),
    SecurityEvent.find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .select('eventType severity timestamp action userId ipAddress'),
  ]);

  return {
    summary,
    highSeverityCount: highSeverity.length,
    highSeverityEvents: highSeverity.slice(0, 10),
    recentEvents,
    periodHours: hours,
  };
}

export { SecurityEvent };
