'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  FolderOpen,
  Link2,
  BarChart3,
  Bell,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Building2,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WorkspaceSwitcher } from './workspace-switcher';
import { useUIStore } from '@/lib/stores/ui-store';
import { usePermissions } from '@/lib/hooks/use-permissions';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: 'canViewAnalytics' | 'canTriggerSync';
  workspaceRoles?: Array<'owner' | 'member' | 'viewer'>;
}

const mainNavItems: NavItem[] = [
  {
    title: 'Chat',
    href: '/chat',
    icon: MessageSquare,
  },
  {
    title: 'Conversations',
    href: '/conversations',
    icon: FolderOpen,
  },
  {
    title: 'Workspaces',
    href: '/workspaces',
    icon: Building2,
  },
  {
    title: 'Members',
    href: '/members',
    icon: Users,
    workspaceRoles: ['owner'],
  },
  {
    title: 'Notion',
    href: '/notion',
    icon: Link2,
    workspaceRoles: ['owner', 'member'],
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    workspaceRoles: ['owner', 'member'],
  },
];

const bottomNavItems: NavItem[] = [
  {
    title: 'Notifications',
    href: '/notifications',
    icon: Bell,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const permissions = usePermissions();

  const filterNavItems = (items: NavItem[]) => {
    return items.filter((item) => {
      // Check workspace role requirements
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

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-sidebar transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center border-b px-3">
        {!sidebarCollapsed && (
          <Link href="/chat" className="flex items-center gap-2 font-semibold">
            <MessageSquare className="h-6 w-6 text-primary" />
            <span>RAG Platform</span>
          </Link>
        )}
        {/* A11Y FIX: Added aria-label and aria-expanded for screen readers */}
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', sidebarCollapsed ? 'mx-auto' : 'ml-auto')}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Workspace Switcher */}
      {!sidebarCollapsed && (
        <div className="p-3">
          <WorkspaceSwitcher />
        </div>
      )}

      {/* Main Navigation */}
      <ScrollArea className="flex-1 px-3">
        <nav className="flex flex-col gap-1 py-2">
          {visibleMainNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Button
                key={item.href}
                asChild
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full',
                  sidebarCollapsed ? 'justify-center px-2' : 'justify-start'
                )}
              >
                <Link href={item.href}>
                  <item.icon
                    className={cn('h-4 w-4', !sidebarCollapsed && 'mr-2')}
                  />
                  {!sidebarCollapsed && <span>{item.title}</span>}
                </Link>
              </Button>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Bottom Navigation */}
      <div className="mt-auto border-t px-3 py-2">
        <nav className="flex flex-col gap-1">
          {visibleBottomNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Button
                key={item.href}
                asChild
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full',
                  sidebarCollapsed ? 'justify-center px-2' : 'justify-start'
                )}
              >
                <Link href={item.href}>
                  <item.icon
                    className={cn('h-4 w-4', !sidebarCollapsed && 'mr-2')}
                  />
                  {!sidebarCollapsed && <span>{item.title}</span>}
                </Link>
              </Button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
