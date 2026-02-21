'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Plus,
  ShieldCheck,
  Trash2,
  FileDown,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import type { Assessment, OverallRisk, AssessmentStatus } from '@/lib/api/assessments';

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

export default function AssessmentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['assessments', activeWorkspace?.id],
    queryFn: async () => {
      const res = await assessmentsApi.list({
        workspaceId: activeWorkspace?.id,
        limit: 50,
      });
      return res.data?.assessments ?? [];
    },
    enabled: !!activeWorkspace?.id,
    refetchInterval: (query) => {
      // Poll every 5s while any assessment is in-progress
      const list = query.state.data as Assessment[] | undefined;
      const hasActive = list?.some(
        (a) => a.status === 'indexing' || a.status === 'analyzing'
      );
      return hasActive ? 5000 : false;
    },
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
    mutationFn: ({ id, vendorName }: { id: string; vendorName: string }) =>
      assessmentsApi.downloadReport(id, vendorName),
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">DORA Assessments</h1>
          <p className="text-muted-foreground">
            Third-party ICT risk assessments under Regulation (EU) 2022/2554
          </p>
        </div>
        <Button onClick={() => router.push('/assessments/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Assessment
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-destructive p-4 rounded-md border border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="text-sm">Failed to load assessments.</p>
        </div>
      ) : data?.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <ShieldCheck className="h-12 w-12 text-muted-foreground/40" />
          <p className="font-medium">No assessments yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Upload vendor ICT documentation to run your first DORA compliance gap analysis.
          </p>
          <Button onClick={() => router.push('/assessments/new')} className="mt-2">
            <Plus className="h-4 w-4 mr-2" />
            New Assessment
          </Button>
        </div>
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
              {data?.map((a: Assessment) => (
                <TableRow
                  key={a._id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/assessments/${a._id}`)}
                >
                  <TableCell className="font-medium">{a.vendorName}</TableCell>
                  <TableCell className="text-muted-foreground">{a.name}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[a.status]}>
                      {a.status === 'indexing' || a.status === 'analyzing' ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : null}
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {a.results?.overallRisk ? (
                      <Badge variant={RISK_VARIANT[a.results.overallRisk]}>
                        {a.results.overallRisk}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(a.createdAt), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {a.status === 'complete' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Download report"
                          onClick={() =>
                            downloadMutation.mutate({ id: a._id, vendorName: a.vendorName })
                          }
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
                            onClick={() => setDeletingId(a._id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete assessment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove the assessment for{' '}
                              <strong>{a.vendorName}</strong> and all indexed documents. This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setDeletingId(null)}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteMutation.mutate(a._id)}
                              disabled={deleteMutation.isPending && deletingId === a._id}
                            >
                              {deleteMutation.isPending && deletingId === a._id ? (
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
