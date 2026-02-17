'use client';

import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { syncStatusColors } from '@/lib/styles/status-colors';
import type { SyncJob } from '@/types';

interface ActiveJobProgress {
  processedDocuments: number;
  totalDocuments: number;
}

interface SyncHistoryProps {
  jobs: SyncJob[];
  isLoading?: boolean;
  /** Real-time progress for active job (from sync metrics) */
  activeJobProgress?: ActiveJobProgress | null;
}

export function SyncHistory({ jobs, isLoading, activeJobProgress }: SyncHistoryProps) {
  const getStatusConfig = (status: SyncJob['status']) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle2,
          label: 'Completed',
          color: syncStatusColors.completed,
        };
      case 'failed':
        return {
          icon: XCircle,
          label: 'Failed',
          color: syncStatusColors.failed,
        };
      case 'processing':
        return {
          icon: Loader2,
          label: 'Processing',
          color: syncStatusColors.processing,
          iconClass: 'animate-spin',
        };
      case 'cancelled':
        return {
          icon: XCircle,
          label: 'Cancelled',
          color: syncStatusColors.cancelled,
        };
      case 'pending':
        return {
          icon: Clock,
          label: 'Pending',
          color: syncStatusColors.pending,
        };
      default:
        return {
          icon: Clock,
          label: status || 'Unknown',
          color: syncStatusColors.idle,
        };
    }
  };

  const formatDuration = (job: SyncJob) => {
    if (!job.startedAt || !job.completedAt) return '-';
    const start = new Date(job.startedAt).getTime();
    const end = new Date(job.completedAt).getTime();
    const seconds = Math.round((end - start) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No sync history yet</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Pages</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => {
          const config = getStatusConfig(job.status);
          const Icon = config.icon;
          return (
            <TableRow key={job.id}>
              <TableCell>
                <Badge variant="secondary" className={config.color}>
                  <Icon
                    className={`h-3 w-3 mr-1 ${'iconClass' in config ? config.iconClass : ''}`}
                  />
                  {config.label}
                </Badge>
              </TableCell>
              <TableCell>
                {job.status === 'processing'
                  ? activeJobProgress
                    ? `${activeJobProgress.processedDocuments} / ${activeJobProgress.totalDocuments}`
                    : `${job.pagesProcessed} / ${job.totalPages}`
                  : job.pagesProcessed}
              </TableCell>
              <TableCell>{formatDuration(job)}</TableCell>
              <TableCell className="text-muted-foreground">
                {job.startedAt
                  ? formatDistanceToNow(new Date(job.startedAt), {
                      addSuffix: true,
                    })
                  : 'Pending'}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
