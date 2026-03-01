'use client';

import {
  FileText,
  Globe,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Trash2,
  Download,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RequirePermission } from '@/components/common';
import { sourcesApi } from '@/lib/api/sources';
import type { DataSource, DataSourceType } from '@/lib/api/sources';

// ── Helpers ────────────────────────────────────────────────────────────────

function SourceTypeIcon({ type, className }: { type: DataSourceType; className?: string }) {
  if (type === 'file') return <FileText className={className} />;
  if (type === 'url') return <Globe className={className} />;
  return <Layers className={className} />;
}

function SourceTypeLabel(type: DataSourceType): string {
  if (type === 'file') return 'File';
  if (type === 'url') return 'Web URL';
  return 'Confluence';
}

function StatusBadge({ status }: { status: DataSource['status'] }) {
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

// ── Component ──────────────────────────────────────────────────────────────

interface DataSourceCardProps {
  dataSource: DataSource;
  workspaceId: string;
}

export function DataSourceCard({ dataSource, workspaceId }: DataSourceCardProps) {
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: () => sourcesApi.triggerSync(dataSource._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources', workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => sourcesApi.delete(dataSource._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sources', workspaceId] });
    },
  });

  const subtitle =
    dataSource.sourceType === 'file'
      ? dataSource.config?.fileName
      : dataSource.sourceType === 'url'
      ? dataSource.config?.url
      : `${dataSource.config?.baseUrl} / ${dataSource.config?.spaceKey}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SourceTypeIcon
              type={dataSource.sourceType}
              className="h-4 w-4 text-muted-foreground"
            />
            <CardTitle className="text-base leading-tight">{dataSource.name}</CardTitle>
          </div>
          <StatusBadge status={dataSource.status} />
        </div>
        <CardDescription className="text-xs truncate mt-1">
          {SourceTypeLabel(dataSource.sourceType)} &mdash; {subtitle}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Stats */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{dataSource.stats?.documentsIndexed ?? 0} chunks indexed</span>
          <span>Last sync: {formatDate(dataSource.lastSyncedAt)}</span>
        </div>

        {/* Error */}
        {dataSource.status === 'error' && dataSource.errorLog?.length ? (
          <p className="text-xs text-destructive truncate">
            {dataSource.errorLog[dataSource.errorLog.length - 1].error}
          </p>
        ) : null}

        {/* Actions */}
        <div className="flex gap-2">
          <RequirePermission permission="canTriggerSync">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={dataSource.status === 'syncing' || syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`}
              />
              Sync
            </Button>
          </RequirePermission>

          {dataSource.storageKey && dataSource.sourceType === 'file' && (
            <Button
              size="sm"
              variant="ghost"
              title="Download original file"
              onClick={() =>
                sourcesApi.downloadFile(dataSource._id, dataSource.config?.fileName ?? dataSource.name)
              }
            >
              <Download className="h-3 w-3" />
            </Button>
          )}

          <RequirePermission permission="canTriggerSync">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirm(`Delete "${dataSource.name}"? This cannot be undone.`)) {
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
