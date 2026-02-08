'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  FolderOpen,
  Link2,
  BarChart3,
  Bell,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { WorkspaceSwitcher } from './workspace-switcher';
import { useUIStore } from '@/lib/stores/ui-store';
import { usePermissions } from '@/lib/hooks/use-permissions';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  workspaceRoles?: Array<'owner' | 'member' | 'viewer'>;
}

const mainNavItems: NavItem[] = [
  { title: 'Chat', href: '/chat', icon: MessageSquare },
  { title: 'Conversations', href: '/conversations', icon: FolderOpen },
  { title: 'Notion', href: '/notion', icon: Link2, workspaceRoles: ['owner', 'member'] },
  { title: 'Analytics', href: '/analytics', icon: BarChart3, workspaceRoles: ['owner', 'member'] },
];

const bottomNavItems: NavItem[] = [
  { title: 'Notifications', href: '/notifications', icon: Bell },
  { title: 'Settings', href: '/settings', icon: Settings },
];

export function MobileSidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const isMobile = useUIStore((state) => state.isMobile);
  const permissions = usePermissions();

  // Close sidebar on route change
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [pathname, isMobile, setSidebarOpen]);

  const filterNavItems = (items: NavItem[]) => {
    return items.filter((item) => {
      if (item.workspaceRoles) {
        const userRole = permissions.isWorkspaceOwner
          ? 'owner'
          : permissions.isWorkspaceMember
          ? 'member'
          : 'viewer';
        if (!item.workspaceRoles.includes(userRole)) {
          return false;
        }
      }
      return true;
    });
  };

  const visibleMainNav = filterNavItems(mainNavItems);
  const visibleBottomNav = filterNavItems(bottomNavItems);

  if (!isMobile) return null;

  return (
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            RAG Platform
          </SheetTitle>
        </SheetHeader>

        <div className="p-3">
          <WorkspaceSwitcher />
        </div>

        <ScrollArea className="flex-1 px-3">
          <nav className="flex flex-col gap-1 py-2">
            {visibleMainNav.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={isActive ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                >
                  <Link href={item.href}>
                    <item.icon className="mr-2 h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>
        </ScrollArea>

        <div className="mt-auto border-t px-3 py-2">
          <nav className="flex flex-col gap-1">
            {visibleBottomNav.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={isActive ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                >
                  <Link href={item.href}>
                    <item.icon className="mr-2 h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </Button>
              );
            })}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
