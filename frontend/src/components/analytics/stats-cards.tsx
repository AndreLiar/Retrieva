'use client';

import { MessageSquare, BarChart3, Clock, ThumbsUp, Database } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AnalyticsSummary } from '@/types';

interface StatsCardsProps {
  data?: AnalyticsSummary;
  cacheStats?: {
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    cacheSize: number;
  };
  isLoading?: boolean;
}

export function StatsCards({ data, cacheStats, isLoading }: StatsCardsProps) {
  const stats = [
    {
      title: 'Total Questions',
      value: data?.totalQuestions ?? 0,
      icon: MessageSquare,
      description: 'Questions asked',
      color: 'text-info',
    },
    {
      title: 'Conversations',
      value: data?.totalConversations ?? 0,
      icon: BarChart3,
      description: 'Active conversations',
      color: 'text-primary',
    },
    {
      title: 'Avg Response Time',
      value: data?.averageResponseTime
        ? `${(data.averageResponseTime / 1000).toFixed(1)}s`
        : '-',
      icon: Clock,
      description: 'Average latency',
      color: 'text-warning',
    },
    {
      title: 'Satisfaction Rate',
      value: data?.satisfactionRate
        ? `${(data.satisfactionRate * 100).toFixed(0)}%`
        : '-',
      icon: ThumbsUp,
      description: 'Positive feedback',
      color: 'text-success',
    },
    {
      title: 'Cache Hit Rate',
      value: cacheStats?.hitRate
        ? `${(cacheStats.hitRate * 100).toFixed(0)}%`
        : '-',
      icon: Database,
      description: `${cacheStats?.totalHits ?? 0} hits / ${cacheStats?.totalMisses ?? 0} misses`,
      color: 'text-chart-2',
    },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <Icon className={cn('h-4 w-4', stat.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
