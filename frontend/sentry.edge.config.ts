/**
 * Sentry — Edge runtime configuration.
 * Loaded automatically by @sentry/nextjs for middleware and edge API routes.
 *
 * The Edge runtime has a limited API surface — no profiling or Node.js integrations.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
