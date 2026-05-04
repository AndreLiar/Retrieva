'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { UserNav } from './user-nav';
import { useUIStore } from '@/lib/stores/ui-store';

// Maps route prefixes/exact paths to human-readable page titles
const PAGE_TITLES: Record<string, string> = {
  '/risk-register':       'Risk Register',
  '/workspaces':          'Vendors',
  '/assessments':         'Gap Analysis',
  '/questionnaires':      'Questionnaires',
  '/chat':                'Ask AI',
  '/conversations':       'Conversation History',
  '/settings':            'Settings',
  '/settings/security':   'Security',
  '/settings/team':       'Team',
  '/settings/billing':    'Billing',
};

// Dynamic route titles for path prefixes
const DYNAMIC_TITLES: Array<[string, string]> = [
  ['/assessments/', 'Assessment Detail'],
  ['/workspaces/',  'Vendor Detail'],
  ['/conversations/', 'Conversation'],
  ['/questionnaires/', 'Questionnaire'],
];

function usePageTitle(pathname: string): string {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Dynamic prefix match
  for (const [prefix, title] of DYNAMIC_TITLES) {
    if (pathname.startsWith(prefix)) return title;
  }
  return '';
}

export function Header() {
  const pathname = usePathname();
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const isMobile = useUIStore((state) => state.isMobile);
  const pageTitle = usePageTitle(pathname);

  return (
    <header className="sticky top-0 z-40 flex h-13 items-center gap-3 border-b border-border bg-background/95 backdrop-blur-sm px-5 sm:px-6">
      {isMobile && (
        <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={toggleSidebar}>
          <Menu className="h-4 w-4" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      )}

      {pageTitle && (
        <span className="text-sm font-medium text-foreground/60 tracking-tight">
          {pageTitle}
        </span>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <UserNav />
      </div>
    </header>
  );
}
