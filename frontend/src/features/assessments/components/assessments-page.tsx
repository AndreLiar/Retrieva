'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast.success(t('assessments.toast.deleted'));
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: () => toast.error(t('assessments.toast.deleteFailed')),
    onSettled: () => setDeletingId(null),
  });

  const downloadMutation = useMutation({
    mutationFn: ({ id, vendorName, framework }: { id: string; vendorName: string; framework: Assessment['framework'] }) =>
      assessmentsApi.downloadReport(id, vendorName, framework),
    onError: () => toast.error(t('assessments.toast.downloadFailed')),
  });

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('assessments.selectWorkspace')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">{t('assessments.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('assessments.subtitle')}
          </p>
        </div>
        <Button onClick={() => router.push('/assessments/new')}>
          <Plus className="h-4 w-4 mr-2" />
          {t('assessments.newButton')}
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
          <p className="text-sm">{t('assessments.loadError')}</p>
        </div>
      ) : data?.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          heading={t('assessments.empty.heading')}
          description={t('assessments.empty.description')}
          cta={t('assessments.empty.cta')}
          onAction={() => router.push('/assessments/new')}
          hint={t('assessments.empty.hint')}
        />
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('assessments.cols.vendor')}</TableHead>
                <TableHead>{t('assessments.cols.assessment')}</TableHead>
                <TableHead>{t('assessments.cols.status')}</TableHead>
                <TableHead>{t('assessments.cols.risk')}</TableHead>
                <TableHead>{t('assessments.cols.created')}</TableHead>
                <TableHead className="text-right">{t('assessments.cols.actions')}</TableHead>
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
                      <Badge variant="outline" className="text-xs ml-2">{t('assessments.art30Badge')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[assessment.status]}>
                      {(assessment.status === 'indexing' || assessment.status === 'analyzing') ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : null}
                      {t(`assessments.status.${assessment.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {assessment.results?.overallRisk ? (
                      <Badge variant={RISK_VARIANT[assessment.results.overallRisk]}>
                        {t(`assessments.risk.${assessment.results.overallRisk}`)}
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
                          title={t('assessments.downloadReportTitle')}
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
                            title={t('assessments.deleteTitle')}
                            onClick={() => setDeletingId(assessment._id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('assessments.deleteConfirmTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('assessments.deleteConfirmDesc1')}
                              <strong>{assessment.vendorName}</strong>
                              {t('assessments.deleteConfirmDesc2')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setDeletingId(null)}>
                              {t('common.cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteMutation.mutate(assessment._id)}
                              disabled={deleteMutation.isPending && deletingId === assessment._id}
                            >
                              {deleteMutation.isPending && deletingId === assessment._id ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : null}
                              {t('common.delete')}
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
