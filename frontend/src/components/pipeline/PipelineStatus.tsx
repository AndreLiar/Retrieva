'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { pipelineApi, type StageMetrics, type QueueStatus } from '@/lib/api/pipeline';

/**
 * Phase 3: Pipeline Status Component
 *
 * Displays pipeline health, per-stage metrics, and migration status.
 */

interface StageCardProps {
  stage: string;
  metrics: StageMetrics;
  queue: QueueStatus;
  onRetry: () => void;
  onDrain: () => void;
  isRetrying: boolean;
}

function StageCard({ stage, metrics, queue, onRetry, onDrain, isRetrying }: StageCardProps) {
  const successRate = metrics.totalJobs > 0
    ? Math.round((metrics.completedJobs / metrics.totalJobs) * 100)
    : 100;

  const getStatusColor = () => {
    if (queue.active > 0) return 'bg-blue-500';
    if (queue.failed > 10) return 'bg-red-500';
    if (successRate < 90) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatStage = (s: string) => s.replace(/_/g, ' ').toUpperCase();

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 ${getStatusColor()}`} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{formatStage(stage)}</CardTitle>
          <div className="flex items-center gap-1">
            {queue.active > 0 && (
              <Badge variant="secondary" className="animate-pulse">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                {queue.active}
              </Badge>
            )}
            {queue.waiting > 0 && (
              <Badge variant="outline">
                <Clock className="h-3 w-3 mr-1" />
                {queue.waiting}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Success Rate */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Success Rate</span>
            <span className={successRate < 90 ? 'text-yellow-600' : 'text-green-600'}>
              {successRate}%
            </span>
          </div>
          <Progress value={successRate} className="h-1" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Completed</span>
            <p className="font-medium">{metrics.completedJobs.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Failed</span>
            <p className={`font-medium ${metrics.failedJobs > 0 ? 'text-red-600' : ''}`}>
              {metrics.failedJobs.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Avg Time</span>
            <p className="font-medium">{formatDuration(metrics.avgTimeMs)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Items</span>
            <p className="font-medium">{metrics.itemsProcessed.toLocaleString()}</p>
          </div>
        </div>

        {/* Last Error */}
        {metrics.lastError && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs text-red-600 cursor-help">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="truncate">Error</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">{metrics.lastError}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Actions */}
        {(queue.failed > 0 || queue.waiting > 5) && (
          <div className="flex gap-1 pt-1">
            {queue.failed > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={onRetry}
                disabled={isRetrying}
              >
                {isRetrying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Retry
                  </>
                )}
              </Button>
            )}
            {queue.waiting > 5 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onDrain}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PipelineStatus() {
  const queryClient = useQueryClient();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [retryingStage, setRetryingStage] = useState<string | null>(null);

  // Fetch pipeline status
  const { data: status, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['pipeline-status'],
    queryFn: () => pipelineApi.getStatus(),
    refetchInterval: 5000,
  });

  // Fetch pipeline health
  const { data: health } = useQuery({
    queryKey: ['pipeline-health'],
    queryFn: () => pipelineApi.getHealth(),
    refetchInterval: 10000,
  });

  // Fetch metrics
  const { data: metricsData, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['pipeline-metrics'],
    queryFn: () => pipelineApi.getMetrics(),
    refetchInterval: 5000,
  });

  // Reset metrics mutation
  const resetMutation = useMutation({
    mutationFn: () => pipelineApi.resetMetrics(),
    onSuccess: () => {
      toast.success('Metrics reset');
      queryClient.invalidateQueries({ queryKey: ['pipeline-metrics'] });
    },
    onError: () => {
      toast.error('Failed to reset metrics');
    },
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: (stage: string) => pipelineApi.retryFailedJobs(stage),
    onSuccess: (data) => {
      toast.success(data?.message || 'Jobs retried');
      queryClient.invalidateQueries({ queryKey: ['pipeline-status'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-metrics'] });
    },
    onError: () => {
      toast.error('Failed to retry jobs');
    },
    onSettled: () => {
      setRetryingStage(null);
    },
  });

  // Drain mutation
  const drainMutation = useMutation({
    mutationFn: (stage: string) => pipelineApi.drainStageQueue(stage),
    onSuccess: () => {
      toast.success('Queue drained');
      queryClient.invalidateQueries({ queryKey: ['pipeline-status'] });
    },
    onError: () => {
      toast.error('Failed to drain queue');
    },
  });

  const handleRetry = (stage: string) => {
    setRetryingStage(stage);
    retryMutation.mutate(stage);
  };

  const handleDrain = (stage: string) => {
    drainMutation.mutate(stage);
  };

  if (isLoadingStatus || isLoadingMetrics) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusData = status?.data;
  const healthData = health?.data;
  const metricsResult = metricsData?.data;

  const stages = statusData?.stageOrder || [];
  const metrics = metricsResult?.metrics || {};
  const queues = statusData?.pipeline?.stages || {};
  const aggregated = metricsResult?.aggregated;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Pipeline Status
              {healthData?.healthy === false && (
                <Badge variant="destructive" className="ml-2">Unhealthy</Badge>
              )}
              {healthData?.healthy === true && (
                <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Healthy
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Document processing pipeline stages and metrics
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['pipeline-status'] });
                queryClient.invalidateQueries({ queryKey: ['pipeline-metrics'] });
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetDialogOpen(true)}
            >
              Reset Metrics
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Aggregated Stats */}
        {aggregated && (
          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Success Rate</p>
                <p className="text-lg font-semibold">{aggregated.successRate}%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-lg font-semibold">{aggregated.completedJobs.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-lg font-semibold">{aggregated.failedJobs.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Avg Time</p>
                <p className="text-lg font-semibold">
                  {aggregated.avgTimeMs < 1000
                    ? `${Math.round(aggregated.avgTimeMs)}ms`
                    : `${(aggregated.avgTimeMs / 1000).toFixed(1)}s`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stage Cards */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {stages.map((stage) => (
            <StageCard
              key={stage}
              stage={stage}
              metrics={metrics[stage] || {
                totalJobs: 0,
                completedJobs: 0,
                failedJobs: 0,
                totalTimeMs: 0,
                avgTimeMs: 0,
                lastError: null,
                lastProcessedAt: null,
                itemsProcessed: 0,
              }}
              queue={queues[stage] || { waiting: 0, active: 0, completed: 0, failed: 0 }}
              onRetry={() => handleRetry(stage)}
              onDrain={() => handleDrain(stage)}
              isRetrying={retryingStage === stage}
            />
          ))}
        </div>

        {/* Embedding Version Info */}
        {statusData?.embeddingVersion && (
          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Embedding Configuration</h4>
            <div className="grid gap-4 md:grid-cols-3 text-sm">
              <div>
                <span className="text-muted-foreground">Version: </span>
                <span className="font-mono">{statusData.embeddingVersion.current}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Local Model: </span>
                <span className="font-mono">{statusData.embeddingVersion.local.model}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Cloud Model: </span>
                <span className="font-mono">{statusData.embeddingVersion.cloud.model}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Pipeline Metrics?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all pipeline stage metrics to zero. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Reset'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default PipelineStatus;
