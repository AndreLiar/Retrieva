'use client';

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { AlertCircle, Loader2, Plus, ShieldCheck } from 'lucide-react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import type { Assessment, AssessmentStatus, OverallRisk } from '@/features/assessments/api/assessments';

const STATUS_VARIANT: Record<
  AssessmentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  indexing: 'secondary',
  analyzing: 'secondary',
  complete: 'default',
  failed: 'destructive',
};

const RISK_VARIANT: Record<OverallRisk, 'default' | 'secondary' | 'destructive'> = {
  Low: 'default',
  Medium: 'secondary',
  High: 'destructive',
};

interface WorkspaceAssessmentsCardProps {
  assessments: Assessment[];
  isLoading: boolean;
  isError: boolean;
}

export function WorkspaceAssessmentsCard({
  assessments,
  isLoading,
  isError,
}: WorkspaceAssessmentsCardProps) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          DORA Gap Assessments
        </CardTitle>
        <Button size="sm" onClick={() => router.push('/assessments/new')}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Assessment
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-md border border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load assessments.
          </div>
        ) : assessments.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Assessment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((assessment) => (
                  <TableRow
                    key={assessment._id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/assessments/${assessment._id}`)}
                  >
                    <TableCell className="font-medium">{assessment.vendorName}</TableCell>
                    <TableCell className="text-muted-foreground">{assessment.name}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[assessment.status]}>
                        {(assessment.status === 'indexing' || assessment.status === 'analyzing') && (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        )}
                        {assessment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {assessment.results?.overallRisk ? (
                        <Badge variant={RISK_VARIANT[assessment.results.overallRisk]}>
                          {assessment.results.overallRisk}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(assessment.createdAt), 'dd MMM yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No assessments yet for this vendor</p>
            <Button size="sm" variant="outline" onClick={() => router.push('/assessments/new')}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Assessment
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
