'use client';

/**
 * ISSUE #43 FIX: Dashboard Error Boundary
 *
 * This file catches errors in any dashboard route and displays
 * a user-friendly error page with recovery options.
 */

import { ErrorPage } from '@/components/error-boundary';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPage error={error} reset={reset} />;
}
