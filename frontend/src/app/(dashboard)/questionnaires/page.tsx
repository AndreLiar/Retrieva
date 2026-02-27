'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Plus,
  ClipboardList,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
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
import { questionnairesApi } from '@/lib/api/questionnaires';
import { useActiveWorkspace } from '@/lib/stores/workspace-store';
import type { VendorQuestionnaire, QuestionnaireStatus } from '@/lib/api/questionnaires';

const STATUS_VARIANT: Record<
  QuestionnaireStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  sent: 'secondary',
  partial: 'secondary',
  complete: 'default',
  expired: 'destructive',
  failed: 'destructive',
};

const STATUS_LABEL: Record<QuestionnaireStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Responding',
  complete: 'Complete',
  expired: 'Expired',
  failed: 'Failed',
};

function ScoreCell({ q }: { q: VendorQuestionnaire }) {
  if (q.status !== 'complete' || q.overallScore === undefined) {
    return <span className="text-muted-foreground">—</span>;
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

export default function QuestionnairesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['questionnaires', activeWorkspace?.id],
    queryFn: async () => {
      const res = await questionnairesApi.list({
        workspaceId: activeWorkspace?.id,
        limit: 50,
      });
      return res.data?.questionnaires ?? [];
    },
    enabled: !!activeWorkspace?.id,
    refetchInterval: (query) => {
      const list = query.state.data as VendorQuestionnaire[] | undefined;
      const hasActive = list?.some(
        (q) => q.status === 'sent' || q.status === 'partial'
      );
      return hasActive ? 5000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => questionnairesApi.delete(id),
    onSuccess: () => {
      toast.success('Questionnaire deleted');
      queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
    },
    onError: () => toast.error('Failed to delete questionnaire'),
    onSettled: () => setDeletingId(null),
  });

  const copyVendorLink = (q: VendorQuestionnaire) => {
    if (!q.token) {
      toast.error('No link yet — send the questionnaire first');
      return;
    }
    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || window.location.origin;
    const link = `${baseUrl}/q/${q.token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(q._id);
      toast.success('Vendor link copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a workspace first</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Questionnaires
          </h1>
          <p className="text-muted-foreground mt-1">
            DORA Art.28/30 vendor due diligence questionnaires
          </p>
        </div>
        <Button onClick={() => router.push('/questionnaires/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Send Questionnaire
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-destructive p-4">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load questionnaires. Please refresh.</span>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-medium text-lg">No questionnaires yet</h3>
          <p className="text-muted-foreground mt-1 mb-4">
            Send a DORA due diligence questionnaire to a vendor to get started.
          </p>
          <Button onClick={() => router.push('/questionnaires/new')}>
            <Plus className="h-4 w-4 mr-2" />
            Send First Questionnaire
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((q) => (
              <TableRow
                key={q._id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/questionnaires/${q._id}`)}
              >
                <TableCell className="font-medium">{q.vendorName}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{q.vendorEmail}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[q.status]} className="flex items-center gap-1 w-fit">
                    {(q.status === 'sent' || q.status === 'partial') && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {STATUS_LABEL[q.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ScoreCell q={q} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {q.sentAt ? format(new Date(q.sentAt), 'dd MMM yyyy') : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Copy vendor link */}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Copy vendor link"
                      onClick={() => copyVendorLink(q)}
                    >
                      {copiedId === q._id ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>

                    {/* Delete */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete questionnaire"
                          onClick={() => setDeletingId(q._id)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete questionnaire?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete the questionnaire for{' '}
                            <strong>{q.vendorName}</strong> and all collected responses.
                            This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setDeletingId(null)}>
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(q._id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deleteMutation.isPending && deletingId === q._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Delete'
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
