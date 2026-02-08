'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontal,
  RefreshCw,
  Trash2,
  ExternalLink,
  FileText,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SyncStatus } from './sync-status';
import { TokenHealthStatus } from './TokenHealthBanner';
import { notionApi } from '@/lib/api';
import type { NotionWorkspace } from '@/types';

interface NotionWorkspaceCardProps {
  workspace: NotionWorkspace;
}

export function NotionWorkspaceCard({ workspace }: NotionWorkspaceCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const isSyncing = workspace.syncStatus === 'syncing';

  const syncMutation = useMutation({
    mutationFn: async (fullSync: boolean = false) => {
      await notionApi.triggerSync(workspace.id, { fullSync });
    },
    onSuccess: () => {
      toast.success('Sync started');
      queryClient.invalidateQueries({ queryKey: ['notion-workspaces'] });
    },
    onError: () => {
      toast.error('Failed to start sync');
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await notionApi.disconnectWorkspace(workspace.id);
    },
    onSuccess: () => {
      toast.success('Notion workspace disconnected');
      setDisconnectDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['notion-workspaces'] });
    },
    onError: () => {
      toast.error('Failed to disconnect');
    },
  });

  return (
    <>
      <Card
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => router.push(`/notion/${workspace.id}`)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center text-lg">
                {workspace.icon || '📝'}
              </div>
              <div>
                <CardTitle className="text-base">{workspace.name}</CardTitle>
                <CardDescription className="text-xs">
                  {isSyncing
                    ? 'Syncing in progress...'
                    : `${workspace.pagesCount} pages synced`}
                </CardDescription>
              </div>
            </div>
            {/* A11Y FIX: Added aria-label for screen readers */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Actions for ${workspace.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-popover/95 backdrop-blur-sm border border-border shadow-lg"
              >
                {/* Hide sync actions during sync to prevent confusion */}
                {!isSyncing && (
                  <>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        syncMutation.mutate(false);
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync Now
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        syncMutation.mutate(true);
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Full Re-sync
                    </DropdownMenuItem>
                  </>
                )}
                {isSyncing && (
                  <DropdownMenuItem disabled className="text-muted-foreground">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sync in progress...
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/notion/${workspace.id}`);
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSyncing) {
                      setDisconnectDialogOpen(true);
                    }
                  }}
                  disabled={isSyncing}
                  className={isSyncing ? 'text-muted-foreground' : 'text-destructive focus:text-destructive'}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isSyncing ? 'Disconnect (disabled during sync)' : 'Disconnect'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <SyncStatus
              status={workspace.syncStatus}
              lastSyncAt={workspace.lastSyncAt}
              compact
            />
            <TokenHealthStatus workspaceId={workspace.id} />
          </div>
          {/* Reassurance message during sync */}
          {isSyncing && (
            <p className="text-xs text-muted-foreground mt-2">
              ⏳ This runs in the background. You can safely leave this page.
            </p>
          )}
          {workspace.lastSyncError && !isSyncing && (
            <p className="text-xs text-destructive mt-2 truncate">
              Error: {workspace.lastSyncError}
            </p>
          )}
          {workspace.syncStatus === 'token_expired' && (
            <p className="text-xs text-destructive mt-2">
              Token expired - reconnect required
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={disconnectDialogOpen}
        onOpenChange={setDisconnectDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Notion Workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the connection to &quot;{workspace.name}&quot;.
              All synced pages will be removed from your knowledge base. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Disconnect'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
