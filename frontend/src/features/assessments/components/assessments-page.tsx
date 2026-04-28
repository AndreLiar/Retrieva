'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Plus, ShieldCheck, Trash2, FileDown, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/onboarding/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { assessmentsApi } from '@/lib/api/assessments';
import { useActiveWorkspace, useAssessmentListQuery } from '@/lib/hooks';
import type { Assessment, OverallRisk, AssessmentStatus } from '@/lib/api/assessments';

const STATUS_VARIANT: Record<AssessmentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
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

export function AssessmentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useAssessmentListQuery({
    workspaceId: activeWorkspace?.id,
    limit: 50,
    refetchWhileProcessing: true,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assessmentsApi.delete(id),
    onSuccess: () => {
      toast.success('Assessment deleted');
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: () => toast.error('Failed to delete assessment'),
    onSettled: () => setDeletingId(null),
  });

  const downloadMutation = useMutation({
    mutationFn: ({ id, vendorName, framework }: { id: string; vendorName: string; framework: Assessment['framework'] }) =>
      assessmentsApi.downloadReport(id, vendorName, framework),
    onError: () => toast.error('Failed to download report'),
  });

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a workspace to view assessments</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">DORA Assessments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Third-party ICT risk assessments under Regulation (EU) 2022/2554
          </p>
        </div>
        <Button onClick={() => router.push('/assessments/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Assessment
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-destructive p-4 rounded-md border border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="text-sm">Failed to load assessments.</p>
        </div>
      ) : data?.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          heading="No gap analyses yet"
          description="Upload vendor ICT documentation to identify DORA Article 28/29 compliance gaps using AI-powered analysis."
          cta="Run your first gap analysis"
          onAction={() => router.push('/assessments/new')}
          hint="Supported formats: PDF, Word. Results include gap findings, risk level, and remediation recommendations."
        />
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((assessment: Assessment) => (
                <TableRow
                  key={assessment._id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/assessments/${assessment._id}`)}
                >
                  <TableCell className="font-medium">{assessment.vendorName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {assessment.name}
                    {assessment.framework === 'CONTRACT_A30' && (
                      <Badge variant="outline" className="text-xs ml-2">Art. 30</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[assessment.status]}>
                      {(assessment.status === 'indexing' || assessment.status === 'analyzing') ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : null}
                      {assessment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {assessment.results?.overallRisk ? (
                      <Badge variant={RISK_VARIANT[assessment.results.overallRisk]}>
                        {assessment.results.overallRisk}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(assessment.createdAt), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {assessment.status === 'complete' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Download report"
                          onClick={() => downloadMutation.mutate({
                            id: assessment._id,
                            vendorName: assessment.vendorName,
                            framework: assessment.framework,
                          })}
                          disabled={downloadMutation.isPending}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Delete assessment"
                            onClick={() => setDeletingId(assessment._id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete assessment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove the assessment for{' '}
                              <strong>{assessment.vendorName}</strong> and all indexed documents. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setDeletingId(null)}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteMutation.mutate(assessment._id)}
                              disabled={deleteMutation.isPending && deletingId === assessment._id}
                            >
                              {deleteMutation.isPending && deletingId === assessment._id ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : null}
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
