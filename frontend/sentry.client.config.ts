/**
 * Sentry — Browser (client-side) configuration.
 * Loaded automatically by @sentry/nextjs for every page rendered in the browser.
 *
 * Required env var: NEXT_PUBLIC_SENTRY_DSN
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // 10% of transactions in production → stays within the free tier.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay: record 10% of sessions, 100% of sessions with errors.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media by default for privacy.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
