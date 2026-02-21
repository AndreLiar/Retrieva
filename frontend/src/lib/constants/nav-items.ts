import {
  MessageSquare,
  FolderOpen,
  Link2,
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
  { title: 'Chat', href: '/chat', icon: MessageSquare },
  { title: 'Conversations', href: '/conversations', icon: FolderOpen },
  { title: 'Workspaces', href: '/workspaces', icon: Building2 },
  { title: 'Members', href: '/members', icon: Users, workspaceRoles: ['owner'] },
  { title: 'Notion', href: '/notion', icon: Link2, workspaceRoles: ['owner', 'member'] },
  { title: 'Analytics', href: '/analytics', icon: BarChart3, workspaceRoles: ['owner', 'member'] },
  { title: 'Assessments', href: '/assessments', icon: ShieldCheck },
];

export const mobileMainNavItems: NavItem[] = [
  { title: 'Chat', href: '/chat', icon: MessageSquare },
  { title: 'Conversations', href: '/conversations', icon: FolderOpen },
  { title: 'Notion', href: '/notion', icon: Link2, workspaceRoles: ['owner', 'member'] },
  { title: 'Analytics', href: '/analytics', icon: BarChart3, workspaceRoles: ['owner', 'member'] },
];

export const bottomNavItems: NavItem[] = [
  { title: 'Notifications', href: '/notifications', icon: Bell },
  { title: 'Settings', href: '/settings', icon: Settings },
];
