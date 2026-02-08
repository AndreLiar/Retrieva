'use client';

import { formatDistanceToNow } from 'date-fns';
import { HelpCircle, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PopularQuestion } from '@/types';

interface PopularQuestionsProps {
  data?: PopularQuestion[];
  isLoading?: boolean;
}

export function PopularQuestions({ data, isLoading }: PopularQuestionsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Popular Questions
        </CardTitle>
        <CardDescription>Most frequently asked questions</CardDescription>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <HelpCircle className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No questions data available</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-4">
              {data.map((question, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-medium shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-clamp-2">{question.question}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {question.count} {question.count === 1 ? 'time' : 'times'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Last asked{' '}
                        {formatDistanceToNow(new Date(question.lastAsked), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
