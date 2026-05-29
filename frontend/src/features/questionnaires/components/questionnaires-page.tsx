'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Plus, ClipboardList, Trash2, Copy, Check, Loader2, AlertCircle, FileSpreadsheet } from 'lucide-react';
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
import { questionnairesApi } from '@/lib/api/questionnaires';
import { workspacesApi } from '@/lib/api/workspaces';
import { useActiveWorkspace, useQuestionnaireListQuery } from '@/lib/hooks';
import type { VendorQuestionnaire, QuestionnaireStatus } from '@/lib/api/questionnaires';

const STATUS_VARIANT: Record<QuestionnaireStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  sent: 'secondary',
  partial: 'secondary',
  complete: 'default',
  expired: 'destructive',
  failed: 'destructive',
};

function ScoreCell({ q }: { q: VendorQuestionnaire }) {
  if (q.status !== 'complete' || q.overallScore === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }
  const score = q.overallScore;
  const colorClass =
    score >= 70
      ? 'text-green-600 font-semibold'
      : score >= 40
        ? 'text-amber-600 font-semibold'
        : 'text-red-600 font-semibold';
  return <span className={colorClass}>{score}/100</span>;
}

export function QuestionnairesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuestionnaireListQuery({
    workspaceId: activeWorkspace?.id,
    limit: 50,
    refetchWhileActive: true,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => questionnairesApi.delete(id),
    onSuccess: () => {
      toast.success(t('questionnaires.toast.deleted'));
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
    },
    onError: () => toast.error(t('questionnaires.toast.deleteFailed')),
    onSettled: () => setDeletingId(null),
  });

  const exportMutation = useMutation({
    mutationFn: () => workspacesApi.exportRoi(),
    onError: () => toast.error(t('questionnaires.toast.exportFailed'), {
      description: t('questionnaires.toast.exportFailedDesc'),
    }),
  });

  const copyVendorLink = (questionnaire: VendorQuestionnaire) => {
    if (!questionnaire.token) {
      toast.error(t('questionnaires.toast.noLink'));
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || window.location.origin;
    const link = `${baseUrl}/q/${questionnaire.token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(questionnaire._id);
      toast.success(t('questionnaires.toast.linkCopied'));
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('questionnaires.selectWorkspace')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            {t('questionnaires.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('questionnaires.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            {t('questionnaires.exportRoi')}
          </Button>
          <Button onClick={() => router.push('/questionnaires/new')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('questionnaires.send')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-destructive p-4">
          <AlertCircle className="h-5 w-5" />
          <span>{t('questionnaires.loadError')}</span>
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          heading={t('questionnaires.empty.heading')}
          description={t('questionnaires.empty.description')}
          cta={t('questionnaires.empty.cta')}
          onAction={() => router.push('/questionnaires/new')}
          hint={t('questionnaires.empty.hint')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('questionnaires.cols.vendor')}</TableHead>
              <TableHead>{t('questionnaires.cols.email')}</TableHead>
              <TableHead>{t('questionnaires.cols.status')}</TableHead>
              <TableHead>{t('questionnaires.cols.score')}</TableHead>
              <TableHead>{t('questionnaires.cols.sent')}</TableHead>
              <TableHead className="text-right">{t('questionnaires.cols.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((questionnaire) => (
              <TableRow
                key={questionnaire._id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/questionnaires/${questionnaire._id}`)}
              >
                <TableCell className="font-medium">{questionnaire.vendorName}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{questionnaire.vendorEmail}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[questionnaire.status]} className="flex items-center gap-1 w-fit">
                    {(questionnaire.status === 'sent' || questionnaire.status === 'partial') && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {t(`questionnaires.status.${questionnaire.status}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ScoreCell q={questionnaire} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {questionnaire.sentAt ? format(new Date(questionnaire.sentAt), 'dd MMM yyyy') : '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('questionnaires.copyLink')}
                      onClick={() => copyVendorLink(questionnaire)}
                    >
                      {copiedId === questionnaire._id ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('questionnaires.deleteTitle')}
                          onClick={() => setDeletingId(questionnaire._id)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('questionnaires.deleteConfirmTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('questionnaires.deleteConfirmDesc1')}
                            <strong>{questionnaire.vendorName}</strong>
                            {t('questionnaires.deleteConfirmDesc2')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setDeletingId(null)}>
                            {t('common.cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(questionnaire._id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deleteMutation.isPending && deletingId === questionnaire._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              t('common.delete')
                            )}
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
      )}
    </div>
  );
}
