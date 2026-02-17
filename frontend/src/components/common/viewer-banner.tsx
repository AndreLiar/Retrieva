'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';

const BANNER_KEY = 'viewer-banner-dismissed';
const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

/**
 * Banner displayed to viewers with limited access.
 * Dismissible, shows once per session.
 */
export function ViewerBanner() {
  const activeWorkspace = useActiveWorkspace();
  const isViewer = activeWorkspace?.membership?.role === 'viewer';

  const dismissed = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(BANNER_KEY) === 'true',
    () => true // SSR: assume dismissed to prevent flash
  );

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(BANNER_KEY, 'true');
    // Force re-render via storage event
    window.dispatchEvent(new StorageEvent('storage'));
  }, []);

  // Don't show if not a viewer or already dismissed
  if (!isViewer || dismissed) {
    return null;
  }

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-info-muted border-info/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-info" />
          <AlertDescription className="text-info">
            You have view-only access to this workspace. Contact the workspace owner for full access.
          </AlertDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-info hover:text-info/80"
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
