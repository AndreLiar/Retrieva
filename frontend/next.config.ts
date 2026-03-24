import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,


  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007/api/v1';
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/proxy/:path*',
          destination: `${apiUrl}/:path*`,
        },
      ];
    }
    return [];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organisation and project slugs (from sentry.io → Settings → Projects)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Auth token for uploading source maps (set SENTRY_AUTH_TOKEN in CI secrets).
  // Without it, builds succeed but stack traces in Sentry won't be human-readable.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress noisy Sentry CLI output in non-CI environments.
  silent: !process.env.CI,

  // Upload a larger set of source maps for better coverage.
  widenClientFileUpload: true,

  // Upload source maps to Sentry but exclude them from the public bundle.
  sourcemaps: {
    disable: false,
  },

  // Suppress Sentry SDK logger calls in the compiled bundle.
  disableLogger: true,

  // Disable automatic Vercel Cron Monitors — not using Vercel.
  automaticVercelMonitors: false,
});
