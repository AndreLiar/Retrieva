import {
  MessageSquare,
  FolderOpen,
  Settings,
  Building2,
  ShieldCheck,
  ClipboardList,
  BarChart3,
} from 'lucide-react';

export interface NavItem {
  /** i18n key (e.g. 'nav.items.riskRegister') — resolved with t() at render. */
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  workspaceRoles?: Array<'owner' | 'member' | 'viewer'>;
}

export interface NavSection {
  /** i18n key (e.g. 'nav.sections.compliance') — resolved with t() at render. */
  label: string;
  items: NavItem[];
}

// Grouped navigation for the desktop sidebar
export const desktopNavSections: NavSection[] = [
  {
    label: 'nav.sections.compliance',
    items: [
      { title: 'nav.items.riskRegister', href: '/risk-register', icon: BarChart3 },
      { title: 'nav.items.vendors', href: '/workspaces', icon: Building2 },
      { title: 'nav.items.gapAnalysis', href: '/assessments', icon: ShieldCheck },
      {
        title: 'nav.items.questionnaires',
        href: '/questionnaires',
        icon: ClipboardList,
        workspaceRoles: ['owner', 'member'],
      },
    ],
  },
  {
    label: 'nav.sections.intelligence',
    items: [
      { title: 'nav.items.askAi', href: '/chat', icon: MessageSquare },
      { title: 'nav.items.history', href: '/conversations', icon: FolderOpen },
    ],
  },
];

// Flattened list kept for backward compatibility
export const desktopMainNavItems: NavItem[] = desktopNavSections.flatMap((s) => s.items);

export const mobileMainNavItems: NavItem[] = [
  { title: 'nav.items.gapAnalysis', href: '/assessments', icon: ShieldCheck },
  {
    title: 'nav.items.questionnaires',
    href: '/questionnaires',
    icon: ClipboardList,
    workspaceRoles: ['owner', 'member'],
  },
  { title: 'nav.items.askAi', href: '/chat', icon: MessageSquare },
  { title: 'nav.items.history', href: '/conversations', icon: FolderOpen },
];

export const bottomNavItems: NavItem[] = [
  { title: 'nav.items.settings', href: '/settings', icon: Settings },
];
