import {
  MessageSquare,
  FolderOpen,
  Database,
  Settings,
  Building2,
  ShieldCheck,
  ClipboardList,
  BarChart3,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  workspaceRoles?: Array<'owner' | 'member' | 'viewer'>;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// Grouped navigation for the desktop sidebar
export const desktopNavSections: NavSection[] = [
  {
    label: 'Compliance',
    items: [
      { title: 'Risk Register', href: '/risk-register', icon: BarChart3 },
      { title: 'Vendors', href: '/workspaces', icon: Building2 },
      { title: 'Gap Analysis', href: '/assessments', icon: ShieldCheck },
      { title: 'Questionnaires', href: '/questionnaires', icon: ClipboardList, workspaceRoles: ['owner', 'member'] },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { title: 'Ask AI', href: '/chat', icon: MessageSquare },
      { title: 'Documents', href: '/sources', icon: Database, workspaceRoles: ['owner', 'member'] },
      { title: 'History', href: '/conversations', icon: FolderOpen },
    ],
  },
];

// Flattened list kept for backward compatibility
export const desktopMainNavItems: NavItem[] = desktopNavSections.flatMap((s) => s.items);

export const mobileMainNavItems: NavItem[] = [
  { title: 'Gap Analysis', href: '/assessments', icon: ShieldCheck },
  { title: 'Questionnaires', href: '/questionnaires', icon: ClipboardList, workspaceRoles: ['owner', 'member'] },
  { title: 'Ask AI', href: '/chat', icon: MessageSquare },
  { title: 'Documents', href: '/sources', icon: Database, workspaceRoles: ['owner', 'member'] },
  { title: 'History', href: '/conversations', icon: FolderOpen },
];

export const bottomNavItems: NavItem[] = [
  { title: 'Settings', href: '/settings', icon: Settings },
];
