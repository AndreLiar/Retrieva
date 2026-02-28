'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AssessmentProgressStepper } from '@/components/assessment/AssessmentProgressStepper';
import { GapAnalysisTable } from '@/components/assessment/GapAnalysisTable';
import { assessmentsApi } from '@/lib/api/assessments';
import type { Assessment, OverallRisk, Gap } from '@/lib/api/assessments';

// ─── Constants ────────────────────────────────────────────────────────────────

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

const RISK_DESCRIPTION_CONTRACT: Record<OverallRisk, string> = {
  Low: 'The contract broadly satisfies DORA Article 30 mandatory clause requirements.',
  Medium: 'Several Article 30 clauses are only partially addressed — renegotiation recommended.',
  High: 'Critical Article 30 clause gaps detected — contract must be renegotiated before use.',
};

// The 12 mandatory Art. 30 clauses — mirrors gapAnalysisAgent.js CONTRACT_A30_CLAUSES
const ART30_CLAUSES = [
  { ref: 'Art.30(2)(a)', category: 'Service Description',    text: 'Clear and complete description of all ICT services and functions to be provided' },
  { ref: 'Art.30(2)(b)', category: 'Data Governance',        text: 'Locations (countries/regions) where data will be processed and stored' },
  { ref: 'Art.30(2)(c)', category: 'Security & Resilience',  text: 'Provisions on availability, authenticity, integrity and confidentiality of data' },
  { ref: 'Art.30(2)(d)', category: 'Data Governance',        text: 'Provisions for accessibility, return, recovery and secure deletion of data on exit' },
  { ref: 'Art.30(2)(e)', category: 'Subcontracting',         text: 'Full description of all subcontractors and their data processing locations' },
  { ref: 'Art.30(2)(f)', category: 'Business Continuity',    text: 'ICT service continuity conditions including service level objective amendments' },
  { ref: 'Art.30(2)(g)', category: 'Business Continuity',    text: "Business continuity plan provisions relevant to the financial entity's services" },
  { ref: 'Art.30(2)(h)', category: 'Termination & Exit',     text: 'Termination rights of the financial entity including adequate notice periods' },
  { ref: 'Art.30(3)(a)', category: 'Service Description',    text: 'Full service level descriptions with quantitative and qualitative performance targets' },
  { ref: 'Art.30(3)(b)', category: 'Regulatory Compliance',  text: 'Advance notification obligations for material changes to ICT services' },
  { ref: 'Art.30(3)(c)', category: 'Audit & Inspection',     text: 'Right to carry out full audits and on-site inspections of the ICT provider' },
  { ref: 'Art.30(3)(d)', category: 'Security & Resilience',  text: 'Obligation to assist the financial entity in ICT-related incident management' },
] as const;

// ─── Art. 30 Clause Scorecard ─────────────────────────────────────────────────

function Art30ClauseScorecard({ gaps }: { gaps: Gap[] }) {
  const results = ART30_CLAUSES.map((clause) => {
    // Match gap by article ref (exact or starts-with for sub-articles)
    const matched = gaps.find(
      (g) => g.article === clause.ref || g.article?.startsWith(clause.ref.split('(')[0])
        && g.domain?.toLowerCase().includes(clause.category.split(' ')[0].toLowerCase())
    ) ?? gaps.find((g) => g.article === clause.ref);

    const status = matched?.gapLevel ?? 'covered';
    return { ...clause, status, gap: matched };
  });

  const covered = results.filter((r) => r.status === 'covered').length;
  const partial = results.filter((r) => r.status === 'partial').length;
  const missing = results.filter((r) => r.status === 'missing').length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-green-600 font-medium">
          <CheckCircle2 className="h-4 w-4" /> {covered} covered
        </span>
        <span className="flex items-center gap-1.5 text-amber-600 font-medium">
          <AlertTriangle className="h-4 w-4" /> {partial} partial
        </span>
        <span className="flex items-center gap-1.5 text-destructive font-medium">
          <XCircle className="h-4 w-4" /> {missing} missing
        </span>
      </div>

      {/* Clause list */}
      <div className="rounded-md border divide-y overflow-hidden">
        {results.map((clause) => {
          const Icon =
            clause.status === 'covered' ? CheckCircle2
            : clause.status === 'partial' ? AlertTriangle
            : XCircle;
          const iconClass =
            clause.status === 'covered' ? 'text-green-500'
            : clause.status === 'partial' ? 'text-amber-500'
            : 'text-destructive';
          const rowClass =
            clause.status === 'missing'
              ? 'bg-destructive/5'
              : clause.status === 'partial'
              ? 'bg-amber-50/50 dark:bg-amber-950/10'
              : '';

          return (
            <div key={clause.ref} className={`px-4 py-3 ${rowClass}`}>
              <div className="flex items-start gap-3">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconClass}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-muted-foreground">
                      {clause.ref}
                    </span>
                    <Badge variant="outline" className="text-xs">{clause.category}</Badge>
                    <Badge
                      variant={
                        clause.status === 'covered' ? 'default'
                        : clause.status === 'partial' ? 'secondary'
                        : 'destructive'
                      }
                      className="text-xs capitalize ml-auto"
                    >
                      {clause.status}
                    </Badge>
                  </div>
                  <p className="text-sm mt-1">{clause.text}</p>
                  {clause.gap?.recommendation && clause.status !== 'covered' && (
                    <p className={`text-xs mt-1 ${clause.status === 'missing' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}`}>
                      → {clause.gap.recommendation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Next Steps Panel ─────────────────────────────────────────────────────────

function NextStepsPanel({ assessment }: { assessment: Assessment }) {
  const router = useRouter();
  const isDora    = assessment.framework === 'DORA';
  const risk      = assessment.results?.overallRisk;
  const wsId      = assessment.workspaceId;
  const missingN  = assessment.results?.gaps.filter((g) => g.gapLevel === 'missing').length ?? 0;
  const partialN  = assessment.results?.gaps.filter((g) => g.gapLevel === 'partial').length ?? 0;

  if (isDora) {
    const isHighRisk = risk === 'High';
    return (
      <Card className={isHighRisk ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5'}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {isHighRisk ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            Next Step — Contract Review (Art. 30)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isHighRisk ? (
            <p className="text-sm text-muted-foreground">
              <strong>{missingN} critical gap(s)</strong> were found. Request a vendor remediation plan to address these before proceeding to contract review. When the remediation plan is received, run the Art. 30 contract review to check all 12 mandatory clauses.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Gap analysis complete.{' '}
              {partialN > 0
                ? `${partialN} partial gap(s) should be addressed in the contract clauses.`
                : 'No critical gaps found.'}
              {' '}Proceed to upload the ICT contract and verify all 12 mandatory DORA Article 30 clauses.
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

  // CONTRACT_A30 complete
  const clausesMissing = assessment.results?.gaps.filter((g) => g.gapLevel === 'missing').length ?? 0;
  const clausesPartial = assessment.results?.gaps.filter((g) => g.gapLevel === 'partial').length ?? 0;
  const contractOk = clausesMissing === 0 && clausesPartial === 0;

  return (
    <Card className={clausesMissing > 0 ? 'border-destructive/40 bg-destructive/5' : clausesPartial > 0 ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10' : 'border-green-300 bg-green-50/50 dark:bg-green-950/10'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {clausesMissing > 0 ? (
            <XCircle className="h-5 w-5 text-destructive" />
          ) : clausesPartial > 0 ? (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          )}
          Contract Review Complete
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {contractOk
            ? 'All 12 mandatory DORA Article 30 clauses are satisfied. This contract is ready for execution.'
            : clausesMissing > 0
            ? `${clausesMissing} clause(s) are missing from the contract and must be added before execution. ${clausesPartial > 0 ? `${clausesPartial} further clause(s) need strengthening.` : ''}`
            : `${clausesPartial} clause(s) are partially addressed — renegotiation recommended before signature.`}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
      assessmentsApi.downloadReport(id, assessment?.vendorName ?? 'vendor', assessment?.framework),
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
  const isComplete   = assessment.status === 'complete';
  const isFailed     = assessment.status === 'failed';
  const isA30        = assessment.framework === 'CONTRACT_A30';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => router.push('/assessments')}
        >
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{assessment.vendorName}</h1>
            <Badge variant="outline" className="text-xs">
              {isA30 ? 'Art. 30 Contract Review' : 'DORA Gap Analysis'}
            </Badge>
          </div>
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
                  doc.status === 'indexed' ? 'default'
                  : doc.status === 'failed'  ? 'destructive'
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
              : isA30
              ? 'Running contract clause review against all 12 Article 30 requirements…'
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

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: isA30 ? 'Total clauses' : 'Total gaps', value: isA30 ? 12 : assessment.results.gaps.length },
              { label: 'Missing', value: assessment.results.gaps.filter((g) => g.gapLevel === 'missing').length, className: 'text-destructive' },
              { label: 'Partial', value: assessment.results.gaps.filter((g) => g.gapLevel === 'partial').length, className: 'text-yellow-600 dark:text-yellow-400' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border p-4 text-center">
                <p className={`text-3xl font-bold ${stat.className ?? ''}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Art. 30 Clause Scorecard (CONTRACT_A30 only) or generic gap table */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              {isA30 ? 'Article 30 Clause Scorecard' : 'Gap Analysis'}
            </h2>
            {isA30 ? (
              <Art30ClauseScorecard gaps={assessment.results.gaps} />
            ) : (
              <GapAnalysisTable gaps={assessment.results.gaps} />
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Report generated at{' '}
            {format(new Date(assessment.results.generatedAt), 'dd MMM yyyy HH:mm')} ·
            Domains analyzed: {assessment.results.domainsAnalyzed.join(', ')}
          </p>

          {/* Next Steps Panel */}
          <NextStepsPanel assessment={assessment} />
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
