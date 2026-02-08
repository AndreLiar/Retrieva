'use client';

import { Bell, Menu } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { UserNav } from './user-nav';
import { useUIStore } from '@/lib/stores/ui-store';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';

export function Header() {
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const isMobile = useUIStore((state) => state.isMobile);

  // Fetch unread notification count
  const { data: notificationData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await notificationsApi.getUnreadCount();
      return response.data?.unreadCount || 0;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const unreadCount = notificationData || 0;

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 sm:px-6">
      {/* Mobile menu button */}
      {isMobile && (
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <Link href="/notifications">
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
            <span className="sr-only">
              {unreadCount} unread notifications
            </span>
          </Button>
        </Link>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User navigation */}
        <UserNav />
      </div>
    </header>
  );
}
