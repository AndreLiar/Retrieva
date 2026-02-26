'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, PanelLeftClose, PanelLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WorkspaceSwitcher } from './workspace-switcher';
import { useUIStore } from '@/lib/stores/ui-store';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { desktopMainNavItems, bottomNavItems, type NavItem } from '@/lib/constants/nav-items';

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

  const visibleMainNav = filterNavItems(desktopMainNavItems);
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
          <Link href="/assessments" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span>Retrieva</span>
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
