'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LanguageSwitcher } from '@/shared/ui/language-switcher';
import { UserNav } from './user-nav';
import { useUIStore } from '@/lib/stores/ui-store';

// Maps route prefixes/exact paths to i18n title keys (resolved with t() below)
const PAGE_TITLES: Record<string, string> = {
  '/risk-register': 'nav.titles.riskRegister',
  '/workspaces': 'nav.titles.vendors',
  '/assessments': 'nav.titles.gapAnalysis',
  '/questionnaires': 'nav.titles.questionnaires',
  '/chat': 'nav.titles.askAi',
  '/conversations': 'nav.titles.conversationHistory',
  '/settings': 'nav.titles.settings',
  '/settings/security': 'nav.titles.security',
  '/settings/team': 'nav.titles.team',
  '/settings/billing': 'nav.titles.billing',
};

// Dynamic route titles for path prefixes (also i18n keys)
const DYNAMIC_TITLES: Array<[string, string]> = [
  ['/assessments/', 'nav.titles.assessmentDetail'],
  ['/workspaces/', 'nav.titles.vendorDetail'],
  ['/conversations/', 'nav.titles.conversation'],
  ['/questionnaires/', 'nav.titles.questionnaire'],
];

/** Returns the i18n title key for the current path, or '' when none matches. */
function usePageTitleKey(pathname: string): string {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Dynamic prefix match
  for (const [prefix, key] of DYNAMIC_TITLES) {
    if (pathname.startsWith(prefix)) return key;
  }
  return '';
}

export function Header() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const isMobile = useUIStore((state) => state.isMobile);
  const pageTitleKey = usePageTitleKey(pathname);

  return (
    <header className="sticky top-0 z-40 flex h-13 items-center gap-3 border-b border-border bg-background/95 backdrop-blur-sm px-5 sm:px-6">
      {isMobile && (
        <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={toggleSidebar}>
          <Menu className="h-4 w-4" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      )}

      {pageTitleKey && (
        <span className="text-sm font-medium text-foreground/60 tracking-tight">
          {t(pageTitleKey)}
        </span>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <LanguageSwitcher />
        <ThemeToggle />
        <UserNav />
      </div>
    </header>
  );
}
