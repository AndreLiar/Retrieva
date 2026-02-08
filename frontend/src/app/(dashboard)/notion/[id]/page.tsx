'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Trash2,
  FileText,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { SyncStatus, SyncHistory, EmbeddingSettings, SyncProgressPanel } from '@/components/notion';
import { notionApi } from '@/lib/api';
import { RequirePermission } from '@/components/common';

interface NotionWorkspacePageProps {
  params: Promise<{ id: string }>;
}

export default function NotionWorkspacePage({ params }: NotionWorkspacePageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  // Fetch workspace details
  const { data: workspace, isLoading: isLoadingWorkspace } = useQuery({
    queryKey: ['notion-workspace', id],
    queryFn: async () => {
      const response = await notionApi.getWorkspace(id);
      return response.data?.workspace;
    },
    enabled: !!id,
    refetchInterval: 5000, // Poll for sync status
  });

  // Fetch sync status
  const { data: syncStatus, isLoading: isLoadingSyncStatus } = useQuery({
    queryKey: ['notion-sync-status', id],
    queryFn: async () => {
      const response = await notionApi.getSyncStatus(id);
      return response.data;
    },
    enabled: !!id,
    refetchInterval: 5000,
  });

  // Fetch sync history
  const { data: syncHistory, isLoading: isLoadingSyncHistory } = useQuery({
    queryKey: ['notion-sync-history', id],
    queryFn: async () => {
      const response = await notionApi.getSyncHistory(id, { limit: 10 });
      return response.data?.syncJobs || [];
    },
    enabled: !!id,
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async (fullSync: boolean = false) => {
      await notionApi.triggerSync(id, { fullSync });
    },
    onSuccess: () => {
      toast.success('Sync started');
      queryClient.invalidateQueries({ queryKey: ['notion-workspace', id] });
      queryClient.invalidateQueries({ queryKey: ['notion-sync-status', id] });
      queryClient.invalidateQueries({ queryKey: ['notion-sync-history', id] });
    },
    onError: () => {
      toast.error('Failed to start sync');
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await notionApi.disconnectWorkspace(id);
    },
    onSuccess: () => {
      toast.success('Notion workspace disconnected');
      router.push('/notion');
    },
    onError: () => {
      toast.error('Failed to disconnect');
    },
  });

  if (isLoadingWorkspace) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-destructive">Notion workspace not found</p>
        <Link href="/notion">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Notion
          </Button>
        </Link>
      </div>
    );
  }

  const isSyncing = workspace.syncStatus === 'syncing';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back button */}
      <Link href="/notion">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Notion
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center text-2xl">
            {workspace.icon || '📝'}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{workspace.name}</h1>
            <p className="text-muted-foreground">
              Connected Notion workspace
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <RequirePermission permission="canTriggerSync">
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate(false)}
              disabled={isSyncing || syncMutation.isPending}
            >
              {isSyncing || syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Now
            </Button>
          </RequirePermission>
          <RequirePermission permission="canTriggerSync">
            <Button
              variant="destructive"
              onClick={() => setDisconnectDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
          </RequirePermission>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pages Synced</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              <FileText className="h-6 w-6 text-muted-foreground" />
              {isLoadingSyncStatus ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                workspace.pagesCount ?? 0
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Synced</CardDescription>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              {isLoadingSyncStatus ? (
                <Skeleton className="h-6 w-32" />
              ) : syncStatus?.workspace?.lastSyncAt ? (
                new Date(syncStatus.workspace.lastSyncAt).toLocaleString()
              ) : (
                'Never'
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sync Status</CardDescription>
            <div className="pt-2">
              {isLoadingSyncStatus ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <SyncStatus
                  status={syncStatus?.workspace?.syncStatus ?? workspace.syncStatus}
                  compact
                />
              )}
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Error Alert */}
      {workspace.lastSyncError && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Last Sync Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {workspace.lastSyncError}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Current Sync Progress - Phase 4: Detailed metrics panel */}
      {isSyncing && (
        <div className="mb-6">
          <SyncProgressPanel
            workspaceId={id}
            onSyncComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['notion-workspace', id] });
              queryClient.invalidateQueries({ queryKey: ['notion-sync-status', id] });
              queryClient.invalidateQueries({ queryKey: ['notion-sync-history', id] });
              toast.success('Sync completed successfully');
            }}
          />
        </div>
      )}

      {/* Embedding Settings - Phase 2 */}
      <div className="mb-6">
        <EmbeddingSettings workspaceId={id} />
      </div>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
          <CardDescription>Recent synchronization jobs</CardDescription>
        </CardHeader>
        <CardContent>
          <SyncHistory
            jobs={syncHistory || []}
            isLoading={isLoadingSyncHistory}
            activeJobProgress={
              isSyncing && syncStatus?.metrics
                ? {
                    processedDocuments: syncStatus.metrics.processedDocuments,
                    totalDocuments: syncStatus.metrics.totalDocuments,
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      {/* Full Re-sync Option */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Full Re-sync</CardTitle>
          <CardDescription>
            Re-sync all pages from scratch. Use this if you notice missing or outdated content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequirePermission permission="canTriggerSync">
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate(true)}
              disabled={isSyncing || syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Start Full Re-sync
            </Button>
          </RequirePermission>
        </CardContent>
      </Card>

      {/* Disconnect Dialog */}
      <AlertDialog
        open={disconnectDialogOpen}
        onOpenChange={setDisconnectDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Notion Workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the connection to &quot;{workspace.name}&quot;.
              All synced pages will be removed from your knowledge base. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disconnectMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Disconnect'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
