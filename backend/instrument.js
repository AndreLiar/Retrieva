/**
 * Sentry instrumentation — must be loaded before any other module.
 *
 * Backend (Node.js ESM): loaded via --import flag in npm scripts so it
 * executes before the application module graph is evaluated.
 *
 * Required env vars:
 *   SENTRY_DSN  — Data Source Name from your Sentry project settings.
 *                 If not set, Sentry is silently disabled.
 *
 * Note: Uses dynamic import with try/catch so that native-module failures
 * (e.g. @sentry-internal/node-profiling on Alpine/musl libc) are caught
 * gracefully instead of crashing the process.
 */
try {
  const Sentry = await import('@sentry/node');

  Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Only active in production — never sends events during local development
    enabled: process.env.NODE_ENV === 'production' && !!process.env.SENTRY_DSN,

    environment: process.env.NODE_ENV || 'development',

    // Capture 10% of transactions in production to stay on the free tier.
    // Use 1.0 in development for full visibility.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Auto-instrument mongoose queries and redis/ioredis commands
    integrations: [Sentry.mongooseIntegration(), Sentry.redisIntegration()],

    // Filter out expected operational errors (4xx) — they are handled by the
    // app and don't represent bugs. Only real crashes reach Sentry.
    beforeSend(event, hint) {
      const err = hint.originalException;
      if (err?.isOperational) return null;
      return event;
    },
  });
} catch (err) {
  // Sentry failed to load (e.g. native profiling module not compatible with
  // the current platform). App continues without error tracking.
  console.warn('[instrument] Sentry unavailable:', err.message);
}
