'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { UsageDataPoint } from '@/types';

interface UsageChartProps {
  data?: UsageDataPoint[];
  isLoading?: boolean;
}

export function UsageChart({ data, isLoading }: UsageChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const formattedData = data?.map((point) => ({
    ...point,
    formattedDate: format(parseISO(point.date), 'MMM d'),
  })) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Over Time</CardTitle>
        <CardDescription>Questions and conversations trend</CardDescription>
      </CardHeader>
      <CardContent>
        {formattedData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            No usage data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="formattedDate"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="questions"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
                name="Questions"
              />
              <Line
                type="monotone"
                dataKey="conversations"
                stroke="hsl(217, 91%, 60%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
                name="Conversations"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
