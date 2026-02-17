'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Link2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NotionWorkspaceCard, TokenHealthBanner } from '@/components/notion';
import { notionApi } from '@/lib/api';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import { RequirePermission } from '@/components/common';

export default function NotionPage() {
  const router = useRouter();
  const activeWorkspace = useActiveWorkspace();

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['notion-workspaces', activeWorkspace?.id],
    queryFn: async () => {
      const response = await notionApi.listWorkspaces();
      return response.data?.workspaces || [];
    },
    enabled: !!activeWorkspace?.id,
    refetchInterval: 10000, // Poll for sync status updates
  });

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a workspace first</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Notion Integration</h1>
          <p className="text-muted-foreground">
            Connect and sync your Notion workspaces
          </p>
        </div>
        <RequirePermission permission="canTriggerSync">
          <Button onClick={() => router.push('/notion/connect')}>
            <Plus className="h-4 w-4 mr-2" />
            Connect Workspace
          </Button>
        </RequirePermission>
      </div>

      {/* Token Health Banner - Only visible to workspace owners */}
      <div className="mb-6">
        <TokenHealthBanner />
      </div>

      {/* Workspace list */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : !workspaces || workspaces.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <Link2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">No Notion workspaces connected</h2>
          <p className="text-muted-foreground mb-4">
            Connect your Notion workspace to start syncing your knowledge base
          </p>
          <RequirePermission permission="canTriggerSync">
            <Button onClick={() => router.push('/notion/connect')}>
              <Plus className="h-4 w-4 mr-2" />
              Connect Notion
            </Button>
          </RequirePermission>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workspaces.map((workspace) => (
            <NotionWorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </div>
      )}
    </div>
  );
}
