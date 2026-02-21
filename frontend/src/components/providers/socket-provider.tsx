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
      // Optimistically increment the badge count in-place — no HTTP round-trip.
      // The header's 5-minute reconciliation poll will correct any drift.
      queryClient.setQueryData<number>(
        ['notifications', 'unread-count'],
        (old) => (old ?? 0) + 1
      );

      // Invalidate only the notification list (so the list page is fresh when
      // opened), but intentionally exclude the count key — we just set it above
      // and don't want an immediate refetch to undo the optimistic update.
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'notifications' && key[1] !== 'unread-count';
        },
      });

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
