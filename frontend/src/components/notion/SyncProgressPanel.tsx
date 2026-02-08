'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Zap,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Activity,
  DollarSign,
  TrendingUp,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { notionApi } from '@/lib/api';

interface SyncMetrics {
  workspaceId: string;
  jobId: string;
  startTime: number;
  elapsedMs: number;
  elapsedMinutes: number;
  totalDocuments: number;
  processedDocuments: number;
  successCount: number;
  skippedCount: number;
  errorCount: number;
  progressPercent: number;
  totalChunks: number;
  chunksProcessed: number;
  docsPerMinute: number;
  chunksPerSecond: number;
  etaMinutes: number | null;
  etaFormatted: string;
  latencyP50: Record<string, number>;
  latencyP95: Record<string, number>;
  successRate: number;
  errorsByType: Record<string, number>;
  retriesCount: number;
  tokensEmbedded: number;
  estimatedCost: number;
  localEmbeddings: number;
  cloudEmbeddings: number;
  currentDocument: string | null;
  currentStage: string | null;
  syncMode: 'cloud' | 'local';
  modeLabel: string;
  isCloudMode: boolean;
}

interface SyncProgressPanelProps {
  workspaceId: string;
  onSyncComplete?: () => void;
}

export function SyncProgressPanel({ workspaceId, onSyncComplete }: SyncProgressPanelProps) {
  const [previousProgress, setPreviousProgress] = useState(0);

  // Poll for sync status and metrics
  const { data, isLoading } = useQuery({
    queryKey: ['sync-status', workspaceId],
    queryFn: async () => {
      const response = await notionApi.getSyncStatus(workspaceId);
      return response.data;
    },
    refetchInterval: 2000, // Poll every 2 seconds during sync
    enabled: !!workspaceId,
  });

  const metrics: SyncMetrics | null = data?.metrics || null;
  const isActive = data?.workspace?.syncStatus === 'syncing';
  const activeJob = data?.activeJobs?.[0];

  // Detect sync completion
  useEffect(() => {
    if (previousProgress > 0 && !isActive && onSyncComplete) {
      onSyncComplete();
    }
    const jobProg = activeJob?.progress;
    const currentProgress = metrics?.progressPercent ?? (
      jobProg && jobProg.totalDocuments > 0
        ? Math.round((((jobProg.successCount ?? 0) + (jobProg.skippedCount ?? 0) + (jobProg.errorCount ?? 0)) / jobProg.totalDocuments) * 100)
        : 0
    );
    if (currentProgress > 0) {
      setPreviousProgress(currentProgress);
    }
  }, [isActive, metrics?.progressPercent, activeJob?.progress, previousProgress, onSyncComplete]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!isActive || !activeJob) {
    return null; // No active sync
  }

  // Calculate rate/ETA from job progress when metrics aren't available
  const jobProgress = activeJob.progress;
  const actualProcessed = (jobProgress?.successCount || 0) + (jobProgress?.skippedCount || 0) + (jobProgress?.errorCount || 0);
  const totalDocs = jobProgress?.totalDocuments || 0;

  let fallbackRate = 0;
  let fallbackEta = 'Calculating...';
  if (activeJob.startedAt && actualProcessed > 0) {
    const elapsedMs = Date.now() - new Date(activeJob.startedAt).getTime();
    const elapsedMinutes = elapsedMs / 60000;
    fallbackRate = elapsedMinutes > 0 ? Math.round((actualProcessed / elapsedMinutes) * 10) / 10 : 0;
    if (fallbackRate > 0 && totalDocs > actualProcessed) {
      const remainingDocs = totalDocs - actualProcessed;
      const etaMinutes = remainingDocs / fallbackRate;
      if (etaMinutes < 1) {
        fallbackEta = 'Less than a minute';
      } else if (etaMinutes < 60) {
        fallbackEta = `~${Math.round(etaMinutes)} minutes`;
      } else {
        const hours = Math.floor(etaMinutes / 60);
        const mins = Math.round(etaMinutes % 60);
        fallbackEta = mins === 0 ? `~${hours}h` : `~${hours}h ${mins}m`;
      }
    }
  }

  // Use metrics if available, otherwise fall back to job progress with calculated rate/ETA
  // Default to cloud mode since we use Azure OpenAI exclusively
  const progress = metrics || {
    progressPercent: totalDocs > 0
      ? Math.round((actualProcessed / totalDocs) * 100)
      : 0,
    totalDocuments: totalDocs,
    processedDocuments: actualProcessed,
    successCount: jobProgress?.successCount || 0,
    skippedCount: jobProgress?.skippedCount || 0,
    errorCount: jobProgress?.errorCount || 0,
    currentDocument: jobProgress?.currentDocument || 'Processing...',
    docsPerMinute: fallbackRate,
    etaFormatted: fallbackEta,
    syncMode: 'cloud' as const,
    modeLabel: 'Azure OpenAI embeddings',
    isCloudMode: true,
    estimatedCost: 0,
    chunksProcessed: 0,
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-background to-muted/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
            <CardTitle className="text-lg">Sync Progress</CardTitle>
          </div>
          <Badge
            variant="default"
            className="gap-1"
          >
            <Zap className="h-3 w-3" />
            Azure
          </Badge>
        </div>
        <CardDescription>{progress.modeLabel}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Main Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {progress.processedDocuments}/{progress.totalDocuments} docs
            </span>
            <span className="text-muted-foreground">{progress.progressPercent}%</span>
          </div>
          <Progress value={progress.progressPercent} className="h-3" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Rate */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Rate</p>
                    <p className="text-sm font-medium">{progress.docsPerMinute} docs/min</p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Current processing rate</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* ETA */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">ETA</p>
                    <p className="text-sm font-medium">{progress.etaFormatted}</p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Estimated time remaining</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Success */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Success</p>
                    <p className="text-sm font-medium">{progress.successCount}</p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Successfully processed documents</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Errors */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  {progress.errorCount > 0 ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {progress.errorCount > 0 ? 'Errors' : 'Skipped'}
                    </p>
                    <p className="text-sm font-medium">
                      {progress.errorCount > 0 ? progress.errorCount : progress.skippedCount}
                    </p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {progress.errorCount > 0
                    ? `${progress.errorCount} errors, ${progress.skippedCount} skipped`
                    : `${progress.skippedCount} documents skipped`}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Current Document */}
        {progress.currentDocument && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{progress.currentDocument}</span>
          </div>
        )}

        {/* Cloud Cost (only shown for cloud mode) */}
        {progress.isCloudMode && progress.estimatedCost > 0 && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-blue-500/10 text-sm">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-500" />
              <span>Estimated Cost</span>
            </div>
            <span className="font-medium">${progress.estimatedCost.toFixed(4)}</span>
          </div>
        )}

        {/* Additional Metrics (collapsed by default) */}
        {metrics && (
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              <Activity className="h-4 w-4" />
              <span>Detailed Metrics</span>
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground">Chunks:</span>{' '}
                  <span className="font-medium">{metrics.chunksProcessed}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground">Retries:</span>{' '}
                  <span className="font-medium">{metrics.retriesCount}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground">Success Rate:</span>{' '}
                  <span className="font-medium">{metrics.successRate}%</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground">Elapsed:</span>{' '}
                  <span className="font-medium">{metrics.elapsedMinutes}m</span>
                </div>
              </div>
              {metrics.isCloudMode && (
                <div className="p-2 rounded bg-blue-500/10">
                  <span className="text-muted-foreground">Tokens Embedded:</span>{' '}
                  <span className="font-medium">{metrics.tokensEmbedded.toLocaleString()}</span>
                </div>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export default SyncProgressPanel;
