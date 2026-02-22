import {
  Bot,
  FolderOpen,
  Database,
  BarChart3,
  Bell,
  Settings,
  Building2,
  Users,
  ShieldCheck,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: 'canViewAnalytics' | 'canTriggerSync';
  workspaceRoles?: Array<'owner' | 'member' | 'viewer'>;
}

export const desktopMainNavItems: NavItem[] = [
  { title: 'Assessments', href: '/assessments', icon: ShieldCheck },
  { title: 'Copilot', href: '/copilot', icon: Bot },
  { title: 'Sources', href: '/sources', icon: Database, workspaceRoles: ['owner', 'member'] },
  { title: 'Conversations', href: '/conversations', icon: FolderOpen },
  { title: 'Analytics', href: '/analytics', icon: BarChart3, workspaceRoles: ['owner', 'member'] },
  { title: 'Members', href: '/members', icon: Users, workspaceRoles: ['owner'] },
  { title: 'Workspaces', href: '/workspaces', icon: Building2 },
];

export const mobileMainNavItems: NavItem[] = [
  { title: 'Assessments', href: '/assessments', icon: ShieldCheck },
  { title: 'Copilot', href: '/copilot', icon: Bot },
  { title: 'Sources', href: '/sources', icon: Database, workspaceRoles: ['owner', 'member'] },
  { title: 'Conversations', href: '/conversations', icon: FolderOpen },
];

export const bottomNavItems: NavItem[] = [
  { title: 'Notifications', href: '/notifications', icon: Bell },
  { title: 'Settings', href: '/settings', icon: Settings },
];
