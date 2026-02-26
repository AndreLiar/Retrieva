'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  FileDown,
  Loader2,
  AlertCircle,
  FileText,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AssessmentProgressStepper } from '@/components/assessment/AssessmentProgressStepper';
import { GapAnalysisTable } from '@/components/assessment/GapAnalysisTable';
import { assessmentsApi } from '@/lib/api/assessments';
import type { Assessment, OverallRisk } from '@/lib/api/assessments';

const RISK_VARIANT: Record<OverallRisk, 'default' | 'secondary' | 'destructive'> = {
  Low: 'default',
  Medium: 'secondary',
  High: 'destructive',
};

const RISK_DESCRIPTION: Record<OverallRisk, string> = {
  Low: 'The vendor demonstrates broad DORA compliance with minor gaps.',
  Medium: 'Several DORA obligations are only partially addressed.',
  High: 'Significant compliance gaps detected — remediation required before contract renewal.',
};

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: assessment, isLoading, isError } = useQuery({
    queryKey: ['assessment', id],
    queryFn: async () => {
      const res = await assessmentsApi.get(id);
      return res.data?.assessment ?? null;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const a = query.state.data as Assessment | null | undefined;
      if (!a) return false;
      return a.status === 'indexing' || a.status === 'analyzing' ? 5000 : false;
    },
  });

  // Notify when assessment transitions to complete or failed
  const prevStatus = assessment?.status;
  useEffect(() => {
    if (prevStatus === 'complete') {
      toast.success('Gap analysis complete — report ready');
    } else if (prevStatus === 'failed') {
      toast.error('Assessment failed');
    }
   
  }, [prevStatus]);

  const downloadMutation = useMutation({
    mutationFn: () =>
      assessmentsApi.downloadReport(id, assessment?.vendorName ?? 'vendor'),
    onError: () => toast.error('Failed to download report'),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !assessment) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-destructive p-4 rounded-md border border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="text-sm">Assessment not found or failed to load.</p>
        </div>
      </div>
    );
  }

  const isInProgress = assessment.status === 'indexing' || assessment.status === 'analyzing';
  const isComplete = assessment.status === 'complete';
  const isFailed = assessment.status === 'failed';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => router.push('/assessments')}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Assessments
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{assessment.vendorName}</h1>
          <p className="text-muted-foreground">{assessment.name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Created {format(new Date(assessment.createdAt), 'dd MMM yyyy HH:mm')}
          </p>
        </div>
        {isComplete && (
          <Button
            onClick={() => downloadMutation.mutate()}
            disabled={downloadMutation.isPending}
          >
            {downloadMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Download Report (.docx)
          </Button>
        )}
      </div>

      {/* Progress stepper */}
      <div className="rounded-lg border p-6">
        <AssessmentProgressStepper
          status={assessment.status}
          statusMessage={assessment.statusMessage}
        />
      </div>

      {/* Documents */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Documents ({assessment.documents.length})</h2>
        <ul className="space-y-2">
          {assessment.documents.map((doc, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              {doc.status === 'indexed' ? (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              ) : doc.status === 'failed' ? (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
              )}
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{doc.fileName}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {(doc.fileSize / (1024 * 1024)).toFixed(1)} MB
              </span>
              <Badge
                variant={
                  doc.status === 'indexed'
                    ? 'default'
                    : doc.status === 'failed'
                    ? 'destructive'
                    : 'outline'
                }
                className="text-xs"
              >
                {doc.status}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      {/* In-progress placeholder */}
      {isInProgress && (
        <div className="rounded-lg border border-dashed p-10 flex flex-col items-center text-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="font-medium">Analysis in progress</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            {assessment.status === 'indexing'
              ? 'Parsing and embedding your documents into the vector store…'
              : 'Running the DORA gap analysis against all indexed content…'}
          </p>
        </div>
      )}

      {/* Results */}
      {isComplete && assessment.results && (
        <div className="space-y-6">
          <Separator />

          {/* Risk summary */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Overall Risk
              </p>
              <div className="flex items-center gap-2">
                <Badge variant={RISK_VARIANT[assessment.results.overallRisk]} className="text-sm px-3 py-1">
                  {assessment.results.overallRisk}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {RISK_DESCRIPTION[assessment.results.overallRisk]}
              </p>
            </div>

            <div className="flex-1 rounded-lg border p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Summary
              </p>
              <p className="text-sm">{assessment.results.summary}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: 'Total gaps',
                value: assessment.results.gaps.length,
              },
              {
                label: 'Missing',
                value: assessment.results.gaps.filter((g) => g.gapLevel === 'missing').length,
                className: 'text-destructive',
              },
              {
                label: 'Partial',
                value: assessment.results.gaps.filter((g) => g.gapLevel === 'partial').length,
                className: 'text-yellow-600 dark:text-yellow-400',
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-4 text-center">
                <p className={`text-3xl font-bold ${stat.className ?? ''}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Gap table */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Gap Analysis</h2>
            <GapAnalysisTable gaps={assessment.results.gaps} />
          </div>

          <p className="text-xs text-muted-foreground">
            Report generated at{' '}
            {format(new Date(assessment.results.generatedAt), 'dd MMM yyyy HH:mm')} ·
            Domains analyzed: {assessment.results.domainsAnalyzed.join(', ')}
          </p>
        </div>
      )}

      {/* Failed */}
      {isFailed && (
        <div className="flex items-center gap-2 text-destructive p-4 rounded-md border border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="text-sm">
            {assessment.statusMessage || 'Assessment failed. Please try again with different documents.'}
          </p>
        </div>
      )}
    </div>
  );
}
