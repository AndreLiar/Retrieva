/**
 * Sentry instrumentation — must be loaded before any other module.
 *
 * Backend (Node.js ESM): loaded via --import flag in npm scripts so it
 * executes before the application module graph is evaluated.
 *
 * Required env vars:
 *   SENTRY_DSN  — Data Source Name from your Sentry project settings.
 *                 If not set, Sentry is silently disabled.
 */
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Silently disabled when DSN is not configured
  enabled: !!process.env.SENTRY_DSN,

  environment: process.env.NODE_ENV || 'development',

  // Capture 10% of transactions in production to stay on the free tier.
  // Use 1.0 in development for full visibility.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Auto-instrument mongoose queries and ioredis commands
  integrations: [Sentry.mongooseIntegration(), Sentry.ioRedisIntegration()],

  // Filter out expected operational errors (4xx) — they are handled by the
  // app and don't represent bugs. Only real crashes reach Sentry.
  beforeSend(event, hint) {
    const err = hint.originalException;
    if (err?.isOperational) return null;
    return event;
  },
});
