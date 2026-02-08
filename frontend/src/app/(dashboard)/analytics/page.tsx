'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarIcon, RefreshCw } from 'lucide-react';
import { format, subDays } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  StatsCards,
  UsageChart,
  FeedbackChart,
  PopularQuestions,
} from '@/components/analytics';
import { analyticsApi } from '@/lib/api';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import { RequirePermission } from '@/components/common';

type TimeRange = '7d' | '30d' | '90d';

export default function AnalyticsPage() {
  const activeWorkspace = useActiveWorkspace();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const getDateRange = () => {
    const endDate = new Date();
    let startDate: Date;

    switch (timeRange) {
      case '7d':
        startDate = subDays(endDate, 7);
        break;
      case '90d':
        startDate = subDays(endDate, 90);
        break;
      default:
        startDate = subDays(endDate, 30);
    }

    return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
    };
  };

  const dateRange = getDateRange();

  // Fetch summary
  const { data: summary, isLoading: isLoadingSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['analytics-summary', activeWorkspace?.id, dateRange],
    queryFn: async () => {
      const response = await analyticsApi.getSummary({
        workspaceId: activeWorkspace?.id,
        ...dateRange,
      });
      return response.data;
    },
    enabled: !!activeWorkspace?.id,
  });

  // Fetch usage data
  const { data: usageData, isLoading: isLoadingUsage, refetch: refetchUsage } = useQuery({
    queryKey: ['analytics-usage', activeWorkspace?.id, dateRange],
    queryFn: async () => {
      const response = await analyticsApi.getUsageData({
        workspaceId: activeWorkspace?.id,
        interval: timeRange === '7d' ? 'day' : timeRange === '30d' ? 'day' : 'week',
        ...dateRange,
      });
      return response.data?.data || [];
    },
    enabled: !!activeWorkspace?.id,
  });

  // Fetch feedback data
  const { data: feedbackData, isLoading: isLoadingFeedback, refetch: refetchFeedback } = useQuery({
    queryKey: ['analytics-feedback', activeWorkspace?.id, dateRange],
    queryFn: async () => {
      const response = await analyticsApi.getFeedbackData({
        workspaceId: activeWorkspace?.id,
        ...dateRange,
      });
      return response.data?.data || [];
    },
    enabled: !!activeWorkspace?.id,
  });

  // Fetch popular questions
  const { data: popularQuestions, isLoading: isLoadingQuestions, refetch: refetchQuestions } = useQuery({
    queryKey: ['analytics-questions', activeWorkspace?.id, dateRange],
    queryFn: async () => {
      const response = await analyticsApi.getPopularQuestions({
        workspaceId: activeWorkspace?.id,
        limit: 10,
        ...dateRange,
      });
      return response.data?.questions || [];
    },
    enabled: !!activeWorkspace?.id,
  });

  // Fetch cache stats
  const { data: cacheStats, isLoading: isLoadingCache, refetch: refetchCache } = useQuery({
    queryKey: ['analytics-cache', activeWorkspace?.id],
    queryFn: async () => {
      const response = await analyticsApi.getCacheStats();
      const performance = response.data?.performance;
      if (!performance) return undefined;
      // Transform backend shape to frontend expected shape
      return {
        hitRate: performance.totalRequests > 0
          ? performance.cacheHits / performance.totalRequests
          : 0,
        totalHits: performance.cacheHits ?? 0,
        totalMisses: performance.cacheMisses ?? 0,
        cacheSize: performance.totalRequests ?? 0,
      };
    },
    enabled: !!activeWorkspace?.id,
  });

  const handleRefresh = () => {
    refetchSummary();
    refetchUsage();
    refetchFeedback();
    refetchQuestions();
    refetchCache();
  };

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a workspace to view analytics</p>
      </div>
    );
  }

  return (
    <RequirePermission
      permission="canViewAnalytics"
      fallback={
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground">
            You don&apos;t have permission to view analytics
          </p>
        </div>
      }
    >
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Analytics</h1>
            <p className="text-muted-foreground">
              Insights and statistics for your workspace
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="w-36">
                <CalendarIcon className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            {/* A11Y FIX: Added aria-label for screen readers */}
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              aria-label="Refresh analytics data"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards
          data={summary}
          cacheStats={cacheStats}
          isLoading={isLoadingSummary || isLoadingCache}
        />

        {/* Charts Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          <UsageChart data={usageData} isLoading={isLoadingUsage} />
          <FeedbackChart data={feedbackData} isLoading={isLoadingFeedback} />
        </div>

        {/* Popular Questions */}
        <PopularQuestions data={popularQuestions} isLoading={isLoadingQuestions} />
      </div>
    </RequirePermission>
  );
}
