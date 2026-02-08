'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  CheckCheck,
  Link2,
  Users,
  AlertTriangle,
  Info,
  Building2,
  Loader2,
  Trash2,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { notificationsApi } from '@/lib/api';
import type { Notification, NotificationType } from '@/types';

const notificationIcons: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  sync_complete: Link2,
  sync_failed: AlertTriangle,
  member_invited: Users,
  member_joined: Users,
  workspace_created: Building2,
  system: Info,
};

const notificationColors: Record<NotificationType, string> = {
  sync_complete: 'bg-green-500/10 text-green-600 dark:text-green-400',
  sync_failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  member_invited: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  member_joined: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  workspace_created: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  system: 'bg-muted text-muted-foreground',
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await notificationsApi.list({ limit: 50 });
      return response.data?.notifications || [];
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await notificationsApi.markAsRead(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await notificationsApi.markAllAsRead();
    },
    onSuccess: () => {
      toast.success('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
    onError: () => {
      toast.error('Failed to mark notifications as read');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await notificationsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
    onError: () => {
      toast.error('Failed to delete notification');
    },
  });

  const unreadCount = notifications?.filter((n) => !n.read).length || 0;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-muted-foreground">
            Stay updated on your workspace activity
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending}
          >
            {markAllAsReadMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4 mr-2" />
            )}
            Mark all as read
          </Button>
        )}
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <CardDescription>
                {unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
                  : 'You\'re all caught up'}
              </CardDescription>
            </div>
            {unreadCount > 0 && (
              <Badge variant="secondary">{unreadCount} new</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-1">No notifications</h3>
              <p className="text-sm text-muted-foreground">
                You&apos;ll be notified when something important happens
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              {notifications.map((notification, index) => {
                const Icon = notificationIcons[notification.type] || Info;
                const colorClass = notificationColors[notification.type] || notificationColors.system;

                return (
                  <div key={notification.id}>
                    {index > 0 && <Separator />}
                    <div
                      className={`flex gap-4 p-4 hover:bg-muted/50 transition-colors ${
                        !notification.read ? 'bg-muted/30' : ''
                      }`}
                    >
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{notification.title}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(notification.createdAt), {
                                addSuffix: true,
                              })}
                            </p>
                          </div>
                          {/* A11Y FIX: Added aria-labels for icon-only buttons */}
                          <div className="flex items-center gap-1 shrink-0">
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => markAsReadMutation.mutate(notification.id)}
                                aria-label="Mark as read"
                              >
                                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteMutation.mutate(notification.id)}
                              aria-label="Delete notification"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {!notification.read && (
                        <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                      )}
                    </div>
                  </div>
                );
              })}
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
