'use client';

import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUIStore, MODAL_IDS } from '@/lib/stores/ui-store';
import { notionApi } from '@/lib/api';

function CreateWorkspaceModal() {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const [isConnecting, setIsConnecting] = useState(false);

  const isOpen = activeModal === MODAL_IDS.CREATE_WORKSPACE;

  const handleConnectNotion = async () => {
    setIsConnecting(true);
    try {
      const response = await notionApi.getAuthUrl();
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        throw new Error('Failed to get authorization URL');
      }
    } catch {
      setIsConnecting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal();
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
          <DialogDescription>
            Connect your Notion account to create a workspace. Your Notion pages
            will be synced and indexed so you can ask questions about them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <h3 className="font-medium text-sm">How it works:</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Connect your Notion account via OAuth</li>
              <li>Select the pages you want to share</li>
              <li>Your pages are synced and indexed automatically</li>
              <li>Start asking questions about your documentation</li>
            </ol>
          </div>
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              <strong>Note:</strong> We only read your Notion content. We never
              modify or delete anything in your Notion workspace.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleConnectNotion} disabled={isConnecting}>
            {isConnecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-2" />
            )}
            {isConnecting ? 'Redirecting...' : 'Connect with Notion'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ModalOutlet() {
  return (
    <>
      <CreateWorkspaceModal />
    </>
  );
}
