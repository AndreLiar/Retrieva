'use client';

import { use, useEffect } from 'react';
import {
  Building2,
  Users,
  Settings,
  Link2,
  BarChart3,
  MessageSquare,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { getRoleDisplayName, getRoleBadgeColor } from '@/lib/utils/permissions';

interface WorkspacePageProps {
  params: Promise<{ id: string }>;
}

export default function WorkspacePage({ params }: WorkspacePageProps) {
  const { id } = use(params);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  // Find workspace from store
  const workspace = workspaces.find((w) => w.id === id);

  // Set this as active workspace when navigating to this page
  useEffect(() => {
    if (workspace && workspace.id !== activeWorkspaceId) {
      setActiveWorkspace(workspace.id);
    }
  }, [workspace, activeWorkspaceId, setActiveWorkspace]);

  // Compute permissions directly from THIS workspace's membership
  // (not from activeWorkspace which may be different on first render)
  const workspaceRole = workspace?.membership?.role;
  const isWorkspaceOwner = workspaceRole === 'owner';
  const canTriggerSync = workspaceRole === 'owner' || workspaceRole === 'member';
  const canViewAnalytics = workspaceRole === 'owner' || workspaceRole === 'member';

  // Debug: log permissions (remove in production)
  console.log('[Workspace Page] Permissions:', {
    workspaceId: id,
    workspaceName: workspace?.name,
    workspaceRole,
    isWorkspaceOwner,
    membership: workspace?.membership,
  });

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  const quickActions = [
    {
      title: 'Start Chat',
      description: 'Ask questions about your knowledge base',
      icon: MessageSquare,
      href: '/',
      color: 'bg-blue-500/10 text-blue-500',
    },
    {
      title: 'View Analytics',
      description: 'See usage statistics and insights',
      icon: BarChart3,
      href: '/analytics',
      color: 'bg-green-500/10 text-green-500',
      hidden: !canViewAnalytics,
    },
    {
      title: 'Notion Integration',
      description: 'Connect and sync your Notion workspace',
      icon: Link2,
      href: '/notion',
      color: 'bg-orange-500/10 text-orange-500',
      hidden: !canTriggerSync,
    },
    {
      title: 'Manage Members',
      description: 'Invite and manage team members',
      icon: Users,
      href: `/workspaces/${id}/members`,
      color: 'bg-purple-500/10 text-purple-500',
      hidden: !isWorkspaceOwner,
    },
  ].filter((action) => !action.hidden);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back button */}
      <Link href="/workspaces">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          All Workspaces
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{workspace.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="secondary"
                className={getRoleBadgeColor(workspace.membership.role)}
              >
                {getRoleDisplayName(workspace.membership.role)}
              </Badge>
              {workspace.syncStatus && (
                <Badge variant="outline">
                  <span
                    className={`h-2 w-2 rounded-full mr-1.5 ${
                      workspace.syncStatus === 'syncing'
                        ? 'bg-yellow-500 animate-pulse'
                        : workspace.syncStatus === 'error'
                        ? 'bg-red-500'
                        : 'bg-green-500'
                    }`}
                  />
                  {workspace.syncStatus === 'syncing'
                    ? 'Syncing'
                    : workspace.syncStatus === 'error'
                    ? 'Sync Error'
                    : 'Synced'}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {isWorkspaceOwner && (
          <Link href={`/workspaces/${id}/settings`}>
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        )}
      </div>

      {/* Description */}
      {workspace.description && (
        <p className="text-muted-foreground mb-8">{workspace.description}</p>
      )}

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-medium mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
                <CardContent className="flex items-center gap-4 p-4">
                  <div
                    className={`h-12 w-12 rounded-lg flex items-center justify-center ${action.color}`}
                  >
                    <action.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-medium">{action.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Stats (placeholder) */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Questions</CardDescription>
            <CardTitle className="text-3xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Documents Synced</CardDescription>
            <CardTitle className="text-3xl">-</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Team Members</CardDescription>
            <CardTitle className="text-3xl">-</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
