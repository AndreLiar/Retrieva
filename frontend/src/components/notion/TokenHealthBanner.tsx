'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, ExternalLink, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { notionApi } from '@/lib/api';
import { useWorkspaceRole } from '@/lib/stores';
import { tokenStatusColors } from '@/lib/styles/status-colors';
import type { TokenHealthWorkspace } from '@/types';

interface TokenHealthBannerProps {
  /** Show only for specific workspace ID (optional) */
  workspaceId?: string;
  /** Compact mode - less padding */
  compact?: boolean;
}

/**
 * Token Health Banner Component
 *
 * Displays warnings when Notion OAuth tokens are expired or invalid.
 * Only visible to workspace owners/admins.
 */
export function TokenHealthBanner({ workspaceId, compact = false }: TokenHealthBannerProps) {
  const queryClient = useQueryClient();
  const workspaceRole = useWorkspaceRole();

  // Only owners can see and manage token health
  const isOwner = workspaceRole === 'owner';

  const { data: tokenHealth, isLoading } = useQuery({
    queryKey: ['token-health'],
    queryFn: async () => {
      const response = await notionApi.getTokenHealth();
      return response.data;
    },
    enabled: isOwner, // Only fetch if user is owner
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 60 * 1000, // Consider fresh for 1 minute
  });

  const checkTokenMutation = useMutation({
    mutationFn: async (wsId: string) => {
      return await notionApi.checkWorkspaceToken(wsId);
    },
    onSuccess: (response) => {
      if (response.data?.isValid) {
        toast.success('Token is valid');
      } else {
        toast.error(`Token status: ${response.data?.status}`);
      }
      queryClient.invalidateQueries({ queryKey: ['token-health'] });
    },
    onError: () => {
      toast.error('Failed to check token');
    },
  });

  // Don't render if not owner
  if (!isOwner) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return null; // Don't show loading state for banner
  }

  // Filter workspaces with issues
  const workspacesWithIssues = tokenHealth?.workspaces?.filter(
    (ws: TokenHealthWorkspace) => {
      if (workspaceId) {
        return ws.workspaceId === workspaceId && ws.needsReconnect;
      }
      return ws.needsReconnect;
    }
  ) || [];

  // No issues to show
  if (workspacesWithIssues.length === 0) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'expired':
      case 'invalid':
      case 'revoked':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-success" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-warning" />;
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'expired':
        return 'Your Notion connection has expired.';
      case 'revoked':
        return 'Notion access was revoked. The integration may have been removed from your Notion workspace.';
      case 'invalid':
        return 'Your Notion connection is no longer valid.';
      default:
        return 'There is an issue with your Notion connection.';
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {workspacesWithIssues.map((ws: TokenHealthWorkspace) => (
        <Alert key={ws.workspaceId} variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">
            Notion Connection Issue
            {getStatusIcon(ws.tokenStatus)}
          </AlertTitle>
          <AlertDescription className="mt-2">
            <p className="text-sm mb-3">
              <strong>{ws.workspaceName}:</strong> {getStatusMessage(ws.tokenStatus)}
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              To continue syncing, please reconnect your Notion workspace.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Redirect to Notion OAuth flow
                  notionApi.getAuthUrl().then((response) => {
                    if (response.data?.authUrl) {
                      window.location.href = response.data.authUrl;
                    }
                  });
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Reconnect Notion
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => checkTokenMutation.mutate(ws.workspaceId)}
                disabled={checkTokenMutation.isPending}
              >
                {checkTokenMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Check Again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

/**
 * Token Health Status Badge
 *
 * Small inline badge showing token status.
 * Only visible to workspace owners.
 */
export function TokenHealthStatus({ workspaceId }: { workspaceId: string }) {
  const workspaceRole = useWorkspaceRole();
  const isOwner = workspaceRole === 'owner';

  const { data: tokenHealth } = useQuery({
    queryKey: ['token-health'],
    queryFn: async () => {
      const response = await notionApi.getTokenHealth();
      return response.data;
    },
    enabled: isOwner,
    staleTime: 60 * 1000,
  });

  if (!isOwner || !tokenHealth) {
    return null;
  }

  const workspace = tokenHealth.workspaces?.find(
    (ws: TokenHealthWorkspace) => ws.workspaceId === workspaceId
  );

  if (!workspace) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        tokenStatusColors[workspace.tokenStatus as keyof typeof tokenStatusColors] || tokenStatusColors.unknown
      }`}
    >
      {workspace.tokenStatus === 'valid' ? (
        <CheckCircle className="h-3 w-3 mr-1" />
      ) : (
        <AlertTriangle className="h-3 w-3 mr-1" />
      )}
      Token: {workspace.tokenStatus}
    </span>
  );
}

export default TokenHealthBanner;
