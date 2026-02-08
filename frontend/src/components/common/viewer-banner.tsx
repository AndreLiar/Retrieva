'use client';

import { useState, useEffect } from 'react';
import { Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';

/**
 * Banner displayed to viewers with limited access.
 * Dismissible, shows once per session.
 */
export function ViewerBanner() {
  const [dismissed, setDismissed] = useState(true); // Start dismissed to prevent flash
  const activeWorkspace = useActiveWorkspace();
  const isViewer = activeWorkspace?.membership?.role === 'viewer';

  // Check session storage on mount
  useEffect(() => {
    const isDismissed = sessionStorage.getItem('viewer-banner-dismissed') === 'true';
    setDismissed(isDismissed);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('viewer-banner-dismissed', 'true');
  };

  // Don't show if not a viewer or already dismissed
  if (!isViewer || dismissed) {
    return null;
  }

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            You have view-only access to this workspace. Contact the workspace owner for full access.
          </AlertDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
          onClick={handleDismiss}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </Alert>
  );
}

/**
 * Inline message for specific features that are restricted for viewers.
 * Use this instead of the global banner for contextual limitations.
 */
export function ViewerInlineNotice({ message }: { message: string }) {
  const activeWorkspace = useActiveWorkspace();
  const isViewer = activeWorkspace?.membership?.role === 'viewer';
  const permissions = activeWorkspace?.membership?.permissions;

  // Check if viewer has limited permissions
  const hasLimitedAccess = isViewer || !permissions?.canQuery;

  if (!hasLimitedAccess) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-md p-3">
      <Info className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
