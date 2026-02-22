'use client';

import {
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Trash2,
  BookOpen,
  GitBranch,
  HardDrive,
  Layers,
  MessageSquare,
  Plug,
  TicketCheck,
  PauseCircle,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RequirePermission } from '@/components/common';
import { mcpApi } from '@/lib/api/mcp';
import type { MCPSource, MCPSourceType, MCPSyncStatus } from '@/lib/api/mcp';

// ── Helpers ────────────────────────────────────────────────────────────────

function MCPTypeIcon({ type, className }: { type: MCPSourceType; className?: string }) {
  if (type === 'confluence') return <Layers className={className} />;
  if (type === 'gdrive') return <HardDrive className={className} />;
  if (type === 'github') return <GitBranch className={className} />;
  if (type === 'jira') return <TicketCheck className={className} />;
  if (type === 'notion') return <BookOpen className={className} />;
  if (type === 'slack') return <MessageSquare className={className} />;
  return <Plug className={className} />;
}

const SOURCE_TYPE_LABELS: Record<MCPSourceType, string> = {
  confluence: 'Confluence',
  gdrive: 'Google Drive',
  github: 'GitHub',
  jira: 'Jira',
  notion: 'Notion',
  slack: 'Slack',
  custom: 'Custom MCP',
};

function StatusBadge({ status }: { status: MCPSyncStatus }) {
  if (status === 'pending')
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" /> Pending
      </Badge>
    );
  if (status === 'syncing')
    return (
      <Badge className="gap-1 bg-blue-500 text-white hover:bg-blue-600">
        <Clock className="h-3 w-3 animate-spin" /> Syncing
      </Badge>
    );
  if (status === 'active')
    return (
      <Badge className="gap-1 bg-green-500 text-white hover:bg-green-600">
        <CheckCircle2 className="h-3 w-3" /> Active
      </Badge>
    );
  if (status === 'paused')
    return (
      <Badge variant="secondary" className="gap-1">
        <PauseCircle className="h-3 w-3" /> Paused
      </Badge>
    );
  if (status === 'error')
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Error
      </Badge>
    );
  return <Badge variant="outline">{status}</Badge>;
}

function formatDate(iso?: string) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncateUrl(url: string, max = 40) {
  try {
    const u = new URL(url);
    const display = u.hostname + (u.pathname !== '/' ? u.pathname : '');
    return display.length > max ? display.slice(0, max) + '…' : display;
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

interface MCPServerCardProps {
  source: MCPSource;
  workspaceId: string;
}

export function MCPServerCard({ source, workspaceId }: MCPServerCardProps) {
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: () => mcpApi.triggerSync(source._id, 'full'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-sources', workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => mcpApi.delete(source._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-sources', workspaceId] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MCPTypeIcon
              type={source.sourceType}
              className="h-4 w-4 text-muted-foreground"
            />
            <CardTitle className="text-base leading-tight">{source.name}</CardTitle>
          </div>
          <StatusBadge status={source.syncStatus} />
        </div>
        <CardDescription className="text-xs mt-1 space-y-0.5">
          <span className="font-medium">{SOURCE_TYPE_LABELS[source.sourceType]}</span>
          {' — '}
          <span className="font-mono">{truncateUrl(source.serverUrl)}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Stats */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{source.stats?.documentsIndexed ?? 0} docs indexed</span>
          <span>Last sync: {formatDate(source.lastSyncedAt)}</span>
        </div>

        {/* Auto-sync badge */}
        {source.syncSettings?.autoSync && (
          <p className="text-xs text-muted-foreground">
            Auto-sync every {source.syncSettings.syncIntervalHours}h
          </p>
        )}

        {/* Last error */}
        {source.syncStatus === 'error' && source.errorLog?.length ? (
          <p className="text-xs text-destructive truncate">
            {source.errorLog[source.errorLog.length - 1].error}
          </p>
        ) : null}

        {/* Actions */}
        <div className="flex gap-2">
          <RequirePermission permission="canTriggerSync">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={source.syncStatus === 'syncing' || syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`}
              />
              Sync
            </Button>
          </RequirePermission>

          <RequirePermission permission="canTriggerSync">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirm(`Remove "${source.name}"? Indexed documents will be de-listed.`)) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </RequirePermission>
        </div>
      </CardContent>
    </Card>
  );
}
