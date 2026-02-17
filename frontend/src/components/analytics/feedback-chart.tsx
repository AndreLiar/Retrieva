'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { FeedbackDataPoint } from '@/types';

interface FeedbackChartProps {
  data?: FeedbackDataPoint[];
  isLoading?: boolean;
}

const COLORS = {
  positive: 'hsl(var(--success))',
  negative: 'hsl(var(--destructive))',
};

export function FeedbackChart({ data, isLoading }: FeedbackChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const positiveCount = data?.find((d) => d.rating === 'positive')?.count ?? 0;
  const negativeCount = data?.find((d) => d.rating === 'negative')?.count ?? 0;
  const total = positiveCount + negativeCount;

  const chartData = [
    {
      name: 'Positive',
      count: positiveCount,
      fill: COLORS.positive,
    },
    {
      name: 'Negative',
      count: negativeCount,
      fill: COLORS.negative,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feedback Distribution</CardTitle>
        <CardDescription>User feedback on responses</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            No feedback data available
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  type="number"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Summary stats */}
            <div className="flex justify-center gap-8 mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-success/10">
                  <ThumbsUp className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium">{positiveCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {total > 0 ? `${((positiveCount / total) * 100).toFixed(0)}%` : '0%'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-destructive/10">
                  <ThumbsDown className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-medium">{negativeCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {total > 0 ? `${((negativeCount / total) * 100).toFixed(0)}%` : '0%'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
