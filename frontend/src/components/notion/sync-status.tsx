'use client';

import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { NotionWorkspace, SyncJob } from '@/types';

interface SyncStatusProps {
  status: NotionWorkspace['syncStatus'];
  currentJob?: SyncJob | null;
  lastSyncAt?: string | null;
  compact?: boolean;
}

export function SyncStatus({
  status,
  currentJob,
  lastSyncAt,
  compact = false,
}: SyncStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'syncing':
        return {
          icon: Loader2,
          label: currentJob ? 'Syncing' : 'Starting sync...',
          color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
          iconClass: 'animate-spin',
        };
      case 'completed':
      case 'active': // Backend uses 'active' after successful sync
        return {
          icon: CheckCircle2,
          label: 'Synced',
          color: 'bg-green-500/10 text-green-600 dark:text-green-400',
          iconClass: '',
        };
      case 'error':
        return {
          icon: XCircle,
          label: 'Error',
          color: 'bg-red-500/10 text-red-600 dark:text-red-400',
          iconClass: '',
        };
      case 'idle':
      default:
        return {
          icon: Clock,
          label: 'Idle',
          color: 'bg-muted text-muted-foreground',
          iconClass: '',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <Badge variant="secondary" className={config.color}>
        <Icon className={`h-3 w-3 mr-1 ${config.iconClass}`} />
        {config.label}
      </Badge>
    );
  }

  const progress =
    currentJob && currentJob.totalPages > 0
      ? Math.round((currentJob.pagesProcessed / currentJob.totalPages) * 100)
      : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className={config.color}>
          <Icon className={`h-3 w-3 mr-1 ${config.iconClass}`} />
          {config.label}
        </Badge>
        {lastSyncAt && (
          <span className="text-xs text-muted-foreground">
            Last synced: {new Date(lastSyncAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {status === 'syncing' && (
        <div className="space-y-1">
          {currentJob && currentJob.totalPages > 0 ? (
            <>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {currentJob.pagesProcessed} / {currentJob.totalPages} pages processed
              </p>
            </>
          ) : (
            <>
              <Progress value={0} className="h-2 animate-pulse" />
              <p className="text-xs text-muted-foreground">
                Preparing documents...
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
