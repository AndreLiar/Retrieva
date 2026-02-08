'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSocket, type NotificationEvent, type SyncStatusEvent } from '@/lib/hooks';

/**
 * Provider component that handles global socket events
 * and invalidates React Query caches when real-time updates arrive
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { on, isConnected } = useSocket();

  useEffect(() => {
    if (!isConnected) return;

    // Handle new notifications
    const unsubNotification = on<NotificationEvent>('notification:new', (notification) => {
      // Invalidate notification queries
      queryClient.invalidateQueries({ queryKey: ['notifications'] });

      // Show toast notification
      toast(notification.title, {
        description: notification.message,
        action: {
          label: 'View',
          onClick: () => {
            window.location.href = '/notifications';
          },
        },
      });
    });

    // Handle sync status updates
    const unsubSync = on<SyncStatusEvent>('sync:status', (status) => {
      // Invalidate notion workspace queries
      queryClient.invalidateQueries({ queryKey: ['notion-workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['notion-workspace', status.notionWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ['notion-sync-status', status.notionWorkspaceId] });
      queryClient.invalidateQueries({ queryKey: ['notion-sync-history', status.notionWorkspaceId] });

      // Show toast for completed/failed syncs
      if (status.status === 'completed') {
        toast.success('Sync completed', {
          description: `${status.pagesProcessed} pages synced successfully`,
        });
      } else if (status.status === 'error') {
        toast.error('Sync failed', {
          description: status.error || 'An error occurred during sync',
        });
      }
    });

    // Handle workspace updates
    const unsubWorkspace = on('workspace:update', () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
    });

    // Handle conversation updates (e.g., when a conversation is pinned/deleted elsewhere)
    const unsubConversation = on('conversation:update', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    return () => {
      unsubNotification();
      unsubSync();
      unsubWorkspace();
      unsubConversation();
    };
  }, [isConnected, on, queryClient]);

  return <>{children}</>;
}
