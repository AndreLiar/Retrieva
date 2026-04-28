'use client';

import { useEffect, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  FileDown,
  Loader2,
  AlertCircle,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Building2,
  FileSearch,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AssessmentProgressStepper } from '@/components/assessment/AssessmentProgressStepper';
import { GapAnalysisTable } from '@/components/assessment/GapAnalysisTable';
import { ResidualRiskMatrix, WeightedDomainChart, FormalRiskDecision } from '@/components/assessment/RiskScoringPanel';
import { Art30ClauseScorecardWithSignoff, NegotiationRoundBadge } from '@/components/assessment/ClauseSignoffPanel';
import { assessmentsApi } from '@/lib/api/assessments';
import { workspacesApi } from '@/lib/api/workspaces';
import { questionnairesApi } from '@/lib/api/questionnaires';
import type { Assessment, OverallRisk } from '@/lib/api/assessments';
import type { VendorQuestionnaire } from '@/lib/api/questionnaires';

const RISK_VARIANT: Record<OverallRisk, 'default' | 'secondary' | 'destructive'> = {
  Low: 'default',
  Medium: 'secondary',
  High: 'destructive',
};

const RISK_DESCRIPTION: Record<OverallRisk, string> = {
  Low: 'The vendor demonstrates broad DORA compliance with minor gaps.',
  Medium: 'Several DORA obligations are only partially addressed.',
  High: 'Significant compliance gaps detected - remediation required before contract renewal.',
};

const RISK_DESCRIPTION_CONTRACT: Record<OverallRisk, string> = {
  Low: 'The contract broadly satisfies DORA Article 30 mandatory clause requirements.',
  Medium: 'Several Article 30 clauses are only partially addressed - renegotiation recommended.',
  High: 'Critical Article 30 clause gaps detected - contract must be renegotiated before use.',
};

function NextStepsPanel({ assessment }: { assessment: Assessment }) {
  const router = useRouter();
  const isDora = assessment.framework === 'DORA';
  const risk = assessment.results?.overallRisk;
  const wsId = assessment.workspaceId;
  let missingN = 0, partialN = 0;
  for (const g of assessment.results?.gaps ?? []) {
    if (g.gapLevel === 'missing') missingN++;
    else if (g.gapLevel === 'partial') partialN++;
  }

  if (isDora) {
    if (assessment.riskDecision?.decision === 'reject') {
      return (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Vendor Rejected - Progression Blocked
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A formal <strong>Reject</strong> decision has been recorded. This vendor cannot be
              onboarded under current controls. To reverse, record a new risk decision above.
            </p>
            {assessment.riskDecision.rationale && (
              <p className="text-sm text-muted-foreground italic">
                Reason: &quot;{assessment.riskDecision.rationale}&quot;
              </p>
            )}
            {wsId && (
              <Button size="sm" variant="outline" onClick={() => router.push(`/workspaces/${wsId}`)}>
                <Building2 className="h-4 w-4 mr-1.5" />
                Back to Vendor
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }

    const isHighRisk = risk === 'High';
    return (
      <Card className={isHighRisk ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {isHighRisk ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-success" />
            )}
            Next Step - Contract Review (Art. 30)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isHighRisk ? (
            <p className="text-sm text-muted-foreground">
              <strong>{missingN} critical gap(s)</strong> were found. Request a vendor remediation
              plan before proceeding to contract review, or record a Conditional decision above.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Gap analysis complete.
              {' '}
              {partialN > 0
                ? `${partialN} partial gap(s) should be addressed in the contract clauses.`
                : 'No critical gaps found.'}
              {' '}
              Proceed to upload the ICT contract and verify all 12 mandatory DORA Article 30 clauses.
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() =>
                router.push(`/assessments/new${wsId ? `?workspaceId=${wsId}` : ''}`)
              }
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Review Contract (Art. 30)
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
            {wsId && (
              <Button size="sm" variant="outline" onClick={() => router.push(`/workspaces/${wsId}`)}>
                <Building2 className="h-4 w-4 mr-1.5" />
                Back to Vendor
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  let clausesMissing = 0, clausesPartial = 0;
  for (const g of assessment.results?.gaps ?? []) {
    if (g.gapLevel === 'missing') clausesMissing++;
    else if (g.gapLevel === 'partial') clausesPartial++;
  }
  const contractOk = clausesMissing === 0 && clausesPartial === 0;

  return (
    <Card className={clausesMissing > 0 ? 'border-destructive/40 bg-destructive/5' : clausesPartial > 0 ? 'border-warning-muted bg-warning-muted/50' : 'border-success-muted bg-success-muted/50'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {clausesMissing > 0 ? (
            <XCircle className="h-5 w-5 text-destructive" />
          ) : clausesPartial > 0 ? (
            <AlertTriangle className="h-5 w-5 text-warning" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-success" />
          )}
          Contract Review Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {contractOk
            ? 'All 12 mandatory DORA Article 30 clauses are satisfied. This contract is ready for execution.'
            : clausesMissing > 0
              ? `${clausesMissing} clause(s) are missing and must be added before execution.${clausesPartial > 0 ? ` ${clausesPartial} further clause(s) need strengthening.` : ''}`
              : `${clausesPartial} clause(s) are partially addressed - renegotiation recommended before signature.`}
        </p>
        <div className="flex gap-2 flex-wrap">
          {wsId && (
            <Button size="sm" onClick={() => router.push(`/workspaces/${wsId}`)}>
              <Building2 className="h-4 w-4 mr-1.5" />
              Back to Vendor Workspace
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
          {!contractOk && (
            <Button size="sm" variant="outline" onClick={() => router.push('/assessments/new')}>
              <FileSearch className="h-4 w-4 mr-1.5" />
              Re-run with revised contract
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface AssessmentDetailPageProps {
  params: Promise<{ id: string }>;
}

export function AssessmentDetailPage({ params }: AssessmentDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const { data: assessment, isLoading, isError } = useQuery({
    queryKey: ['assessment', id],
    queryFn: async () => {
      const res = await assessmentsApi.get(id);
      return res.data?.assessment ?? null;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const currentAssessment = query.state.data as Assessment | null | undefined;
      if (!currentAssessment) {
        return false;
      }
      return currentAssessment.status === 'indexing' || currentAssessment.status === 'analyzing' ? 5000 : false;
    },
  });

  const { data: workspace } = useQuery({
    queryKey: ['workspace', assessment?.workspaceId],
    queryFn: async () => {
      const res = await workspacesApi.get(assessment!.workspaceId);
      return res.data?.workspace ?? null;
    },
    enabled: !!assessment?.workspaceId && assessment?.framework === 'DORA',
  });

  const { data: siblingA30 } = useQuery({
    queryKey: ['assessments', assessment?.workspaceId, 'CONTRACT_A30'],
    queryFn: async () => {
      const res = await assessmentsApi.list({ workspaceId: assessment!.workspaceId, limit: 50 });
      return (res.data?.assessments ?? []).filter((currentAssessment) => currentAssessment.framework === 'CONTRACT_A30');
    },
    enabled: !!assessment?.workspaceId && assessment?.framework === 'CONTRACT_A30',
  });

  const { data: wsQuestionnaires } = useQuery({
    queryKey: ['questionnaires', assessment?.workspaceId, 'risk'],
    queryFn: async () => {
      const res = await questionnairesApi.list({ workspaceId: assessment!.workspaceId });
      return (res.data?.questionnaires ?? []) as VendorQuestionnaire[];
    },
    enabled: !!assessment?.workspaceId && assessment?.framework === 'DORA',
  });

  const latestCompletedQ = useMemo(() => {
    if (!wsQuestionnaires) return undefined;
    let latest: VendorQuestionnaire | undefined;
    for (const q of wsQuestionnaires) {
      if (q.status !== 'complete') continue;
      if (!latest || new Date(q.createdAt) > new Date(latest.createdAt)) latest = q;
    }
    return latest;
  }, [wsQuestionnaires]);

  const gapCounts = useMemo(() => {
    let missing = 0, partial = 0;
    for (const g of assessment?.results?.gaps ?? []) {
      if (g.gapLevel === 'missing') missing++;
      else if (g.gapLevel === 'partial') partial++;
    }
    return { missing, partial };
  }, [assessment?.results?.gaps]);

  const prevStatus = assessment?.status;

  useEffect(() => {
    if (prevStatus === 'complete') {
      toast.success('Analysis complete - report ready');
    } else if (prevStatus === 'failed') {
      toast.error('Assessment failed');
    }
  }, [prevStatus]);

  const downloadMutation = useMutation({
    mutationFn: () =>
      assessmentsApi.downloadReport(id, assessment?.vendorName ?? 'vendor', assessment?.framework),
    onError: () => toast.error('Failed to download report'),
  });

  if (isLoading) {
    return (
      <div className="page-container max-w-4xl mx-auto">
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
  const isA30 = assessment.framework === 'CONTRACT_A30';

  return (
    <div className="page-container max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push('/assessments')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Assessments
        </Button>
        {assessment.workspaceId && (
          <>
            <span className="text-muted-foreground text-sm">/</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/workspaces/${assessment.workspaceId}`)}
            >
              <Building2 className="h-4 w-4 mr-1" />
              {assessment.vendorName}
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="page-title">{assessment.vendorName}</h1>
            <Badge variant="outline" className="text-xs">
              {isA30 ? 'Art. 30 Contract Review' : 'DORA Gap Analysis'}
            </Badge>
            {isA30 && siblingA30 && (
              <NegotiationRoundBadge assessments={siblingA30} currentId={id} />
            )}
          </div>
          <p className="text-muted-foreground">{assessment.name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Created {format(new Date(assessment.createdAt), 'dd MMM yyyy HH:mm')}
          </p>
        </div>
        {isComplete && (
          <Button onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}>
            {downloadMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Download Report (.docx)
          </Button>
        )}
      </div>

      <div className="rounded-lg border p-6">
        <AssessmentProgressStepper
          status={assessment.status}
          statusMessage={assessment.statusMessage}
        />
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Documents ({assessment.documents.length})</h2>
        <ul className="space-y-2">
          {assessment.documents.map((doc, index) => (
            <li key={index} className="flex items-center gap-3 text-sm">
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
                variant={doc.status === 'indexed' ? 'default' : doc.status === 'failed' ? 'destructive' : 'outline'}
                className="text-xs"
              >
                {doc.status}
              </Badge>
              {doc.storageKey && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title="Download document"
                  onClick={() => assessmentsApi.downloadAssessmentFile(id, index, doc.fileName)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isInProgress && (
        <div className="rounded-lg border border-dashed p-10 flex flex-col items-center text-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="font-medium">Analysis in progress</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            {assessment.status === 'indexing'
              ? 'Parsing and embedding your documents into the vector store...'
              : isA30
                ? 'Running contract clause review against all 12 Article 30 requirements...'
                : 'Running the DORA gap analysis against all indexed content...'}
          </p>
        </div>
      )}

      {isComplete && assessment.results && (
        <div className="space-y-6">
          <Separator />

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Overall Risk
              </p>
              <Badge variant={RISK_VARIANT[assessment.results.overallRisk]} className="text-sm px-3 py-1">
                {assessment.results.overallRisk}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {isA30
                  ? RISK_DESCRIPTION_CONTRACT[assessment.results.overallRisk]
                  : RISK_DESCRIPTION[assessment.results.overallRisk]}
              </p>
            </div>
            <div className="flex-1 rounded-lg border p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Summary
              </p>
              <p className="text-sm">{assessment.results.summary}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: isA30 ? 'Total clauses' : 'Total gaps', value: isA30 ? 12 : assessment.results.gaps.length },
              { label: 'Missing', value: gapCounts.missing, className: 'text-destructive' },
              { label: 'Partial', value: gapCounts.partial, className: 'text-warning' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-4 text-center">
                <p className={`text-3xl font-bold ${stat.className ?? ''}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {!isA30 && (
            <>
              <ResidualRiskMatrix
                assessment={assessment}
                workspace={workspace ?? null}
                qScore={latestCompletedQ?.overallScore ?? null}
              />
              <WeightedDomainChart assessment={assessment} />
            </>
          )}

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              {isA30 ? 'Article 30 Clause Scorecard' : 'Gap Analysis'}
            </h2>
            {isA30 ? (
              <Art30ClauseScorecardWithSignoff assessment={assessment} />
            ) : (
              <GapAnalysisTable gaps={assessment.results.gaps} />
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Report generated at
            {' '}
            {format(new Date(assessment.results.generatedAt), 'dd MMM yyyy HH:mm')}
            {' · '}
            Domains analyzed: {assessment.results.domainsAnalyzed.join(', ')}
          </p>

          {!isA30 && (
            <FormalRiskDecision assessment={assessment} assessmentId={id} />
          )}

          <NextStepsPanel assessment={assessment} />
        </div>
      )}

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
