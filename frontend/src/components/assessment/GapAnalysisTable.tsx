'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Gap, GapLevel } from '@/lib/api/assessments';

const GAP_VARIANT: Record<GapLevel, 'default' | 'secondary' | 'destructive'> = {
  covered: 'default',
  partial: 'secondary',
  missing: 'destructive',
};

const GAP_LABEL: Record<GapLevel, string> = {
  covered: 'Covered',
  partial: 'Partial',
  missing: 'Missing',
};

interface GapAnalysisTableProps {
  gaps: Gap[];
}

export function GapAnalysisTable({ gaps }: GapAnalysisTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (gaps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">No gaps recorded.</p>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Article</TableHead>
            <TableHead>Domain</TableHead>
            <TableHead className="hidden md:table-cell">Requirement</TableHead>
            <TableHead>Gap</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {gaps.map((gap, idx) => {
            const isOpen = expanded.has(idx);
            return (
              <>
                <TableRow
                  key={`row-${idx}`}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => toggle(idx)}
                >
                  <TableCell className="pr-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6" tabIndex={-1}>
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{gap.article}</TableCell>
                  <TableCell className="whitespace-nowrap">{gap.domain}</TableCell>
                  <TableCell className="hidden md:table-cell max-w-xs truncate">
                    {gap.requirement}
                  </TableCell>
                  <TableCell>
                    <Badge variant={GAP_VARIANT[gap.gapLevel]}>{GAP_LABEL[gap.gapLevel]}</Badge>
                  </TableCell>
                </TableRow>

                {isOpen && (
                  <TableRow key={`detail-${idx}`}>
                    <TableCell />
                    <TableCell colSpan={4} className="py-3">
                      <div className="space-y-3 text-sm">
                        <div>
                          <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">
                            Requirement
                          </p>
                          <p>{gap.requirement}</p>
                        </div>
                        <div>
                          <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">
                            Vendor Coverage
                          </p>
                          <p>{gap.vendorCoverage}</p>
                        </div>
                        <div>
                          <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">
                            Recommendation
                          </p>
                          <p
                            className={cn(
                              gap.gapLevel === 'missing' && 'text-destructive',
                              gap.gapLevel === 'partial' && 'text-yellow-600 dark:text-yellow-400'
                            )}
                          >
                            {gap.recommendation}
                          </p>
                        </div>
                        {gap.sourceChunks.length > 0 && (
                          <div>
                            <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">
                              Evidence chunks
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                              {gap.sourceChunks.map((chunk, ci) => (
                                <li key={ci} className="truncate">
                                  {chunk}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
