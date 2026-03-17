'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, PanelLeftClose, PanelLeft } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WorkspaceSwitcher } from './workspace-switcher';
import { useUIStore } from '@/lib/stores/ui-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { desktopNavSections, bottomNavItems, type NavItem } from '@/lib/constants/nav-items';

export function Sidebar() {
  const pathname = usePathname();
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const permissions = usePermissions();
  const user = useAuthStore((state) => state.user);

  const filterNavItems = (items: NavItem[]) => {
    return items.filter((item) => {
      if (item.workspaceRoles) {
        const userRole = permissions.isWorkspaceOwner
          ? 'owner'
          : permissions.isWorkspaceMember
          ? 'member'
          : 'viewer';
        if (!item.workspaceRoles.includes(userRole)) return false;
      }
      return true;
    });
  };

  const visibleBottomNav = filterNavItems(bottomNavItems);

  return (
    <aside
      data-sidebar
      className={cn(
        'flex h-full flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* ── Logo header ── */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-sidebar-border px-4',
          sidebarCollapsed && 'justify-center px-0'
        )}
      >
        {!sidebarCollapsed && (
          <Link href="/assessments" className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="h-5 w-5 shrink-0 text-sidebar-primary" />
            <span className="font-display text-lg font-semibold text-sidebar-foreground tracking-tight truncate">
              Retrieva
            </span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent',
            sidebarCollapsed ? '' : 'ml-auto'
          )}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed
            ? <PanelLeft className="h-4 w-4" aria-hidden />
            : <PanelLeftClose className="h-4 w-4" aria-hidden />}
        </Button>
      </div>

      {/* ── Org label + workspace switcher ── */}
      {!sidebarCollapsed && (
        <div className="px-4 pt-3 pb-3 border-b border-sidebar-border space-y-2">
          {user?.organization && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/30 truncate">
              {user.organization.name}
            </p>
          )}
          <WorkspaceSwitcher />
        </div>
      )}

      {/* ── Main Navigation ── */}
      <ScrollArea className="flex-1 py-3">
        <nav className={cn('flex flex-col', sidebarCollapsed ? 'px-2' : 'px-3')}>
          {desktopNavSections.map((section, idx) => {
            const visibleItems = filterNavItems(section.items);
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.label} className={cn(idx > 0 && 'mt-4')}>
                {/* Section label — hidden when collapsed */}
                {!sidebarCollapsed && (
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/25 select-none">
                    {section.label}
                  </p>
                )}

                {/* Section separator when collapsed */}
                {sidebarCollapsed && idx > 0 && (
                  <div className="mb-2 border-t border-sidebar-border/40" />
                )}

                <div className="flex flex-col gap-0.5">
                  {visibleItems.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href === '/conversations' && pathname.startsWith('/conversations/')) ||
                      (item.href === '/assessments' && pathname.startsWith('/assessments/')) ||
                      (item.href === '/workspaces' && pathname.startsWith('/workspaces/'));
                    return (
                      <NavLink
                        key={item.href}
                        item={item}
                        isActive={isActive}
                        collapsed={sidebarCollapsed}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* ── Bottom Navigation ── */}
      <div className={cn('shrink-0 border-t border-sidebar-border py-3', sidebarCollapsed ? 'px-2' : 'px-3')}>
        <nav className="flex flex-col gap-0.5">
          {visibleBottomNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive}
                collapsed={sidebarCollapsed}
              />
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

// ─── Nav link atom ────────────────────────────────────────────────────────────

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.title : undefined}
      className={cn(
        'relative flex items-center rounded-sm text-sm transition-colors duration-150',
        collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
        isActive
          ? 'nav-item-active bg-sidebar-accent text-sidebar-foreground font-medium'
          : 'text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground/80'
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.title}</span>}
    </Link>
  );
}
