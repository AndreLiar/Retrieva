/**
 * Sentry — Server-side (Node.js runtime) configuration.
 * Loaded automatically by @sentry/nextjs for SSR and API routes.
 *
 * Required env var: SENTRY_DSN  (server-only, not exposed to browser)
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production' && !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
