import {
  MessageSquare,
  FolderOpen,
  Database,
  Settings,
  Building2,
  ShieldCheck,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  workspaceRoles?: Array<'owner' | 'member' | 'viewer'>;
}

export const desktopMainNavItems: NavItem[] = [
  { title: 'Gap Analysis', href: '/assessments', icon: ShieldCheck },
  { title: 'Ask AI', href: '/chat', icon: MessageSquare },
  { title: 'Documents', href: '/sources', icon: Database, workspaceRoles: ['owner', 'member'] },
  { title: 'History', href: '/conversations', icon: FolderOpen },
  { title: 'Vendors', href: '/workspaces', icon: Building2 },
];

export const mobileMainNavItems: NavItem[] = [
  { title: 'Gap Analysis', href: '/assessments', icon: ShieldCheck },
  { title: 'Ask AI', href: '/chat', icon: MessageSquare },
  { title: 'Documents', href: '/sources', icon: Database, workspaceRoles: ['owner', 'member'] },
  { title: 'History', href: '/conversations', icon: FolderOpen },
];

export const bottomNavItems: NavItem[] = [
  { title: 'Settings', href: '/settings', icon: Settings },
];
