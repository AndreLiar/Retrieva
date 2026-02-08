'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex h-screen items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Go Home
          </Button>
          <Button onClick={reset}>Try Again</Button>
        </div>
      </div>
    </div>
  );
}
