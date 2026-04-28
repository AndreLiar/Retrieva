'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Copy,
  Check,
  Mail,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSearch,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { questionnairesApi } from '@/lib/api/questionnaires';
import type { VendorQuestionnaire, QuestionnaireQuestion, QuestionnaireStatus, GapLevel } from '@/lib/api/questionnaires';

const STEP_LABELS = ['Draft', 'Sent', 'Vendor Responding', 'Scoring', 'Complete'];

const GAP_VARIANT: Record<GapLevel, 'default' | 'secondary' | 'destructive'> = {
  covered: 'default',
  partial: 'secondary',
  missing: 'destructive',
};

function getRiskLabel(score: number): { label: string; variant: 'default' | 'secondary' | 'destructive' } {
  if (score >= 70) {
    return { label: 'Low Risk', variant: 'default' };
  }
  if (score >= 40) {
    return { label: 'Medium Risk', variant: 'secondary' };
  }
  return { label: 'High Risk', variant: 'destructive' };
}

function getScoreColor(score: number) {
  if (score >= 70) {
    return 'text-success';
  }
  if (score >= 40) {
    return 'text-warning';
  }
  return 'text-red-600';
}

function ProgressStepper({ status }: { status: QuestionnaireStatus }) {
  const stepIndex =
    status === 'draft' ? 0
      : status === 'sent' ? 1
        : status === 'partial' ? 2
          : status === 'complete' ? 4
            : 4;

  return (
    <div className="flex items-center gap-1">
      {STEP_LABELS.map((label, index) => {
        const isComplete = index < stepIndex;
        const isCurrent = index === stepIndex;
        const isFuture = index > stepIndex;

        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors
                  ${isComplete ? 'bg-primary border-primary text-primary-foreground'
                    : isCurrent ? 'border-primary text-primary bg-primary/10'
                      : 'border-muted-foreground/30 text-muted-foreground/40 bg-transparent'
                  }`}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </div>
              <span
                className={`text-xs mt-1 whitespace-nowrap ${isFuture ? 'text-muted-foreground/40' : isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
              >
                {label}
              </span>
            </div>
            {index < STEP_LABELS.length - 1 && (
              <div
                className={`h-px w-8 mx-1 mb-4 transition-colors ${isComplete ? 'bg-primary' : 'bg-muted-foreground/20'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CategoryBreakdown({ questions }: { questions: QuestionnaireQuestion[] }) {
  // Single pass over all questions builds per-category stats — avoids O(n × categories) multi-filter
  type CatStats = { covered: number; partial: number; missing: number; scoreSum: number; scoreCount: number };
  const categoryMap = new Map<string, CatStats>();
  for (const q of questions) {
    if (!categoryMap.has(q.category)) {
      categoryMap.set(q.category, { covered: 0, partial: 0, missing: 0, scoreSum: 0, scoreCount: 0 });
    }
    const s = categoryMap.get(q.category)!;
    if (q.gapLevel === 'covered') s.covered++;
    else if (q.gapLevel === 'partial') s.partial++;
    else if (q.gapLevel === 'missing') s.missing++;
    if (q.score !== undefined) { s.scoreSum += q.score; s.scoreCount++; }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[...categoryMap.entries()].map(([category, s]) => {
        const avgScore = s.scoreCount > 0 ? Math.round(s.scoreSum / s.scoreCount) : null;
        return (
          <Card key={category} className="text-sm">
            <CardContent className="pt-4 pb-3">
              <p className="font-medium text-xs text-muted-foreground mb-1 uppercase tracking-wide">
                {category}
              </p>
              {avgScore !== null && (
                <p className={`text-xl font-bold ${getScoreColor(avgScore)}`}>{avgScore}</p>
              )}
              <div className="flex gap-2 mt-2 text-xs">
                <span className="text-success">{s.covered} ✓</span>
                <span className="text-warning">{s.partial} ~</span>
                <span className="text-red-600">{s.missing} ✗</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AnswerRow({ q }: { q: QuestionnaireQuestion }) {
  const [expanded, setExpanded] = useState(false);
  const answer = q.answer || '';
  const truncated = answer.length > 120 ? `${answer.slice(0, 120)}…` : answer;

  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="font-mono text-xs">{q.doraArticle}</Badge>
      </TableCell>
      <TableCell className="text-sm">{q.category}</TableCell>
      <TableCell className="max-w-xs">
        <p className="text-sm">{expanded ? answer : truncated}</p>
        {answer.length > 120 && (
          <button
            className="text-xs text-primary mt-1 flex items-center gap-0.5"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Show less</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> Show more</>
            )}
          </button>
        )}
        {!answer && <span className="text-muted-foreground text-xs italic">No answer</span>}
      </TableCell>
      <TableCell>
        {q.score !== undefined ? (
          <span className={`font-semibold ${getScoreColor(q.score)}`}>{q.score}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        {q.gapLevel ? (
          <Badge variant={GAP_VARIANT[q.gapLevel]} className="capitalize text-xs">
            {q.gapLevel}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground max-w-xs">
        {q.reasoning || '-'}
      </TableCell>
    </TableRow>
  );
}

function RiskDecisionPanel({ q }: { q: VendorQuestionnaire }) {
  const router = useRouter();
  const score = q.overallScore ?? 0;

  const missingGaps: QuestionnaireQuestion[] = [];
  const partialGaps: QuestionnaireQuestion[] = [];
  for (const question of q.questions) {
    if (question.gapLevel === 'missing') missingGaps.push(question);
    else if (question.gapLevel === 'partial') partialGaps.push(question);
  }
  const totalGaps = missingGaps.length + partialGaps.length;

  type Decision = 'proceed' | 'conditional' | 'reject';
  const decision: Decision = score >= 70 ? 'proceed' : score >= 40 ? 'conditional' : 'reject';

  const config = {
    proceed: {
      Icon: CheckCircle2,
      iconClass: 'text-success',
      borderClass: 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800',
      badge: 'bg-success-muted text-success border-success-muted',
      label: 'Proceed to contracting',
      headline: 'Vendor meets baseline DORA requirements.',
      detail: `Score of ${score}/100 indicates acceptable ICT risk posture. ${totalGaps > 0 ? `${totalGaps} partial gap(s) should be addressed via contract clauses.` : 'No critical gaps identified.'}`,
      next: [
        { label: 'Review Contract (Art. 30)', icon: FileText, href: '/assessments/new?framework=CONTRACT_A30' },
      ],
    },
    conditional: {
      Icon: AlertTriangle,
      iconClass: 'text-warning',
      borderClass: 'border-warning-muted bg-warning-muted',
      badge: 'bg-warning-muted text-warning border-warning-muted',
      label: 'Proceed with conditions',
      headline: 'Vendor may proceed to contracting with remediation conditions.',
      detail: `Score of ${score}/100. ${missingGaps.length} critical gap(s) must be addressed in the contract or via a vendor remediation plan before signature.`,
      next: [
        { label: 'Run Gap Analysis', icon: FileSearch, href: '/assessments/new' },
        { label: 'Review Contract (Art. 30)', icon: FileText, href: '/assessments/new?framework=CONTRACT_A30' },
      ],
    },
    reject: {
      Icon: XCircle,
      iconClass: 'text-destructive',
      borderClass: 'border-destructive/30 bg-destructive/5',
      badge: 'bg-red-100 text-red-800 border-red-200',
      label: 'Do not proceed',
      headline: 'Significant ICT risk gaps - contracting not recommended.',
      detail: `Score of ${score}/100. ${missingGaps.length} critical gap(s) identified. Request a vendor remediation plan and re-assess before contracting.`,
      next: [
        { label: 'Run Gap Analysis', icon: FileSearch, href: '/assessments/new' },
      ],
    },
  }[decision];

  return (
    <Card className={`border-2 ${config.borderClass}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <config.Icon className={`h-5 w-5 ${config.iconClass}`} />
          <CardTitle className="text-base">Contracting Decision</CardTitle>
          <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full border ${config.badge}`}>
            {config.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-medium">{config.headline}</p>
          <p className="text-sm text-muted-foreground mt-1">{config.detail}</p>
        </div>

        {missingGaps.length > 0 && (
          <div className="rounded-md border bg-background p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Critical gaps requiring action
            </p>
            {missingGaps.map((gap) => (
              <div key={gap.id} className="flex items-start gap-2 text-sm">
                <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                <span><span className="font-medium">{gap.category}</span> · {gap.text.slice(0, 80)}…</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 flex-wrap pt-1">
          <p className="w-full text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Next step
          </p>
          {config.next.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant={decision === 'proceed' ? 'default' : 'outline'}
              onClick={() => router.push(action.href)}
            >
              <action.icon className="h-4 w-4 mr-1.5" />
              {action.label}
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface QuestionnaireDetailPageProps {
  params: Promise<{ id: string }>;
}

export function QuestionnaireDetailPage({ params }: QuestionnaireDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['questionnaire', id],
    queryFn: async () => {
      const res = await questionnairesApi.get(id);
      return res.data?.questionnaire;
    },
    refetchInterval: (query) => {
      const questionnaire = query.state.data as VendorQuestionnaire | undefined;
      return questionnaire?.status === 'sent' || questionnaire?.status === 'partial' ? 5000 : false;
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => questionnairesApi.send(id),
    onSuccess: () => {
      toast.success('Invitation email resent');
      queryClient.invalidateQueries({ queryKey: ['questionnaire', id] });
    },
    onError: () => toast.error('Failed to resend email'),
  });

  const copyLink = () => {
    if (!data?.token) {
      toast.error('No vendor link yet - the questionnaire has not been sent');
      return;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || window.location.origin;
    const link = `${baseUrl}/q/${data.token}`;

    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      toast.success('Vendor link copied');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span>Failed to load questionnaire. Please go back and try again.</span>
      </div>
    );
  }

  const questionnaire = data;
  const risk = questionnaire.overallScore !== undefined ? getRiskLabel(questionnaire.overallScore) : null;
  const isPolling = questionnaire.status === 'sent' || questionnaire.status === 'partial';

  return (
    <div className="page-container max-w-5xl mx-auto">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push('/questionnaires')}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Questionnaires
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{questionnaire.vendorName}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{questionnaire.vendorEmail}</p>
          {questionnaire.sentAt && (
            <p className="text-muted-foreground text-xs mt-1">
              Sent {format(new Date(questionnaire.sentAt), 'dd MMM yyyy')}
              {questionnaire.tokenExpiresAt &&
                ` · Expires ${format(new Date(questionnaire.tokenExpiresAt), 'dd MMM yyyy')}`}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {isPolling && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Waiting for vendor...
            </span>
          )}
          {(questionnaire.status === 'sent' || questionnaire.status === 'partial') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resendMutation.mutate()}
              disabled={resendMutation.isPending}
            >
              {resendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Mail className="h-4 w-4 mr-1.5" />
              )}
              Resend Email
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={copyLink}>
            {copied ? (
              <Check className="h-4 w-4 mr-1.5 text-success" />
            ) : (
              <Copy className="h-4 w-4 mr-1.5" />
            )}
            Copy Vendor Link
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 pb-5 overflow-x-auto">
          <ProgressStepper status={questionnaire.status} />
        </CardContent>
      </Card>

      {questionnaire.status === 'complete' && questionnaire.overallScore !== undefined && risk && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assessment Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <span className={`text-5xl font-bold ${getScoreColor(questionnaire.overallScore)}`}>
                {questionnaire.overallScore}
              </span>
              <div>
                <span className="text-muted-foreground text-lg">/100</span>
                <div className="mt-1">
                  <Badge variant={risk.variant}>{risk.label}</Badge>
                </div>
              </div>
            </div>
            <Progress value={questionnaire.overallScore} className="h-2" />
            {questionnaire.results?.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">{questionnaire.results.summary}</p>
            )}
            {questionnaire.results?.generatedAt && (
              <p className="text-xs text-muted-foreground">
                Generated {format(new Date(questionnaire.results.generatedAt), 'dd MMM yyyy HH:mm')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {questionnaire.status === 'complete' && questionnaire.overallScore !== undefined && (
        <RiskDecisionPanel q={questionnaire} />
      )}

      {questionnaire.status === 'partial' && (
        <Card className="border-warning-muted bg-warning-muted">
          <CardContent className="flex items-center gap-3 pt-5 pb-5">
            <Loader2 className="h-5 w-5 animate-spin text-warning" />
            <div>
              <p className="font-medium text-sm">Scoring in progress</p>
              <p className="text-xs text-muted-foreground">
                The vendor has submitted their responses. LLM scoring is running - this page will
                update automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {(questionnaire.status === 'failed' || questionnaire.status === 'expired') && (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 pt-5 pb-5">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-sm capitalize">{questionnaire.status}</p>
              <p className="text-xs text-muted-foreground">
                {questionnaire.statusMessage || (questionnaire.status === 'expired'
                  ? 'The vendor link has expired. Create a new questionnaire to retry.'
                  : 'Scoring encountered an error. Please contact support.')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {questionnaire.status === 'complete' && questionnaire.questions.some((question) => question.gapLevel) && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            By Category
          </h2>
          <CategoryBreakdown questions={questionnaire.questions} />
        </div>
      )}

      {questionnaire.questions.some((question) => question.answer) && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Vendor Responses
          </h2>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Article</TableHead>
                  <TableHead className="w-36">Category</TableHead>
                  <TableHead>Answer</TableHead>
                  <TableHead className="w-16">Score</TableHead>
                  <TableHead className="w-24">Gap</TableHead>
                  <TableHead>Reasoning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questionnaire.questions.map((question) => (
                  <AnswerRow key={question.id} q={question} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
