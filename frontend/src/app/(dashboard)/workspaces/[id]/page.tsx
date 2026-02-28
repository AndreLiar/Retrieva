'use client';

import { use, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Building2,
  Settings,
  ArrowLeft,
  Globe,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Circle,
  FileSearch,
  ClipboardList,
  FileText,
  Bell,
  ChevronRight,
  BellOff,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { workspacesApi } from '@/lib/api/workspaces';
import { assessmentsApi } from '@/lib/api/assessments';
import { questionnairesApi } from '@/lib/api/questionnaires';
import type { Assessment, OverallRisk, AssessmentStatus } from '@/lib/api/assessments';
import type { VendorQuestionnaire } from '@/lib/api/questionnaires';
import type { VendorTier, VendorStatus, WorkspaceWithMembership } from '@/types';

interface WorkspacePageProps {
  params: Promise<{ id: string }>;
}

// ─── Badge variant maps ───────────────────────────────────────────────────────

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

// ─── Small helpers ────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: VendorTier }) {
  if (tier === 'critical')  return <Badge variant="destructive">Critical</Badge>;
  if (tier === 'important') return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Important</Badge>;
  return <Badge variant="outline">Standard</Badge>;
}

function VendorStatusBadge({ status }: { status: VendorStatus }) {
  if (status === 'active')        return <Badge variant="default">Active</Badge>;
  if (status === 'under-review')  return <Badge variant="secondary">Under Review</Badge>;
  return <Badge variant="outline">Exited</Badge>;
}

function ContractDaysChip({ contractEnd }: { contractEnd: string }) {
  const nowMs = new Date().getTime();
  const days = Math.ceil((new Date(contractEnd).getTime() - nowMs) / 86_400_000);
  const color = days < 30 ? 'text-destructive' : days < 90 ? 'text-amber-600' : 'text-green-600';
  return <span className={`text-xs font-medium ${color}`}>({days < 0 ? `${Math.abs(days)}d overdue` : `+${days}d`})</span>;
}


// ─── Compliance Checklist ─────────────────────────────────────────────────────

type StepStatus = 'done' | 'in-progress' | 'pending';

interface ChecklistStep {
  n: number;
  Icon: React.ElementType;
  title: string;
  status: StepStatus;
  detail: string;
  href?: string;
  actionLabel?: string;
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'done')        return <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />;
  if (status === 'in-progress') return <Clock className="h-5 w-5 text-amber-500 shrink-0" />;
  return <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />;
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'done')        return <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100 text-xs">Done</Badge>;
  if (status === 'in-progress') return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-xs">In progress</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>;
}

function ComplianceChecklist({
  workspace,
  assessments,
  questionnaires,
}: {
  workspace: WorkspaceWithMembership;
  assessments: Assessment[];
  questionnaires: VendorQuestionnaire[];
}) {
  const router = useRouter();
  const workspaceId = workspace.id;

  // ── Step 1: Classification ─────────────────────────────────────────────────
  const classifyDone = !!(workspace.vendorTier && workspace.serviceType);

  // ── Step 2: Due Diligence Questionnaire ────────────────────────────────────
  const latestQ = questionnaires[0] ?? null;
  const qStatus: StepStatus =
    latestQ?.status === 'complete'                   ? 'done'
    : latestQ?.status === 'sent' || latestQ?.status === 'partial' ? 'in-progress'
    : 'pending';

  // ── Step 3: Gap Analysis (DORA framework) ─────────────────────────────────
  const doraAssessments = assessments.filter((a) => a.framework === 'DORA');
  const latestDora = doraAssessments[0] ?? null;
  const doraStatus: StepStatus =
    latestDora?.status === 'complete'                           ? 'done'
    : latestDora?.status === 'analyzing' || latestDora?.status === 'indexing' ? 'in-progress'
    : 'pending';

  // ── Step 4: Contract Review (Art. 30) ─────────────────────────────────────
  const a30Assessments = assessments.filter((a) => a.framework === 'CONTRACT_A30');
  const latestA30 = a30Assessments[0] ?? null;
  const a30Status: StepStatus =
    latestA30?.status === 'complete'                           ? 'done'
    : latestA30?.status === 'analyzing' || latestA30?.status === 'indexing' ? 'in-progress'
    : 'pending';

  // ── Step 5: Monitoring ─────────────────────────────────────────────────────
  const hasCerts   = (workspace.certifications?.length ?? 0) > 0;
  const hasReview  = !!workspace.nextReviewDate;
  const monitorStatus: StepStatus = hasCerts && hasReview ? 'done' : hasCerts || hasReview ? 'in-progress' : 'pending';

  const steps: ChecklistStep[] = [
    {
      n: 1,
      Icon: Building2,
      title: 'Classify vendor',
      status: classifyDone ? 'done' : 'pending',
      detail: classifyDone
        ? `${workspace.vendorTier} · ${workspace.serviceType}`
        : 'Set vendor tier and service type',
      href: classifyDone ? undefined : `/workspaces/${workspaceId}/settings`,
      actionLabel: classifyDone ? undefined : 'Complete in Settings',
    },
    {
      n: 2,
      Icon: ClipboardList,
      title: 'Due diligence questionnaire',
      status: qStatus,
      detail:
        qStatus === 'done'        ? `Score ${latestQ?.overallScore ?? '—'}/100 · submitted ${latestQ?.respondedAt ? format(new Date(latestQ.respondedAt), 'dd MMM yyyy') : '—'}`
        : qStatus === 'in-progress' ? `Sent to ${latestQ?.vendorEmail ?? 'vendor'} · awaiting response`
        : 'Send Art. 28 due diligence form to vendor',
      href: qStatus === 'pending' ? '/questionnaires/new' : `/questionnaires/${latestQ?._id}`,
      actionLabel: qStatus === 'pending' ? 'Send questionnaire' : 'View results',
    },
    {
      n: 3,
      Icon: FileSearch,
      title: 'Gap analysis (Art. 28/29)',
      status: doraStatus,
      detail:
        doraStatus === 'done'        ? `Risk: ${latestDora?.results?.overallRisk ?? '—'} · ${format(new Date(latestDora!.createdAt), 'dd MMM yyyy')}`
        : doraStatus === 'in-progress' ? 'Indexing documents…'
        : 'Upload vendor ICT docs and run AI gap analysis',
      href: doraStatus === 'pending' ? '/assessments/new' : `/assessments/${latestDora?._id}`,
      actionLabel: doraStatus === 'pending' ? 'Run analysis' : 'View report',
    },
    {
      n: 4,
      Icon: FileText,
      title: 'Contract review (Art. 30)',
      status: a30Status,
      detail:
        a30Status === 'done'        ? `All 12 Art.30 clauses checked · ${format(new Date(latestA30!.createdAt), 'dd MMM yyyy')}`
        : a30Status === 'in-progress' ? 'Reviewing contract clauses…'
        : 'Upload the ICT contract to verify all 12 mandatory clauses',
      href: a30Status === 'pending' ? '/assessments/new' : `/assessments/${latestA30?._id}`,
      actionLabel: a30Status === 'pending' ? 'Review contract' : 'View report',
    },
    {
      n: 5,
      Icon: Bell,
      title: 'Set up monitoring',
      status: monitorStatus,
      detail:
        monitorStatus === 'done'        ? `${workspace.certifications?.length} cert(s) tracked · next review ${format(new Date(workspace.nextReviewDate!), 'dd MMM yyyy')}`
        : monitorStatus === 'in-progress' ? `${hasCerts ? 'Certifications added' : 'Next review date set'} · add the other field`
        : 'Add certifications and next review date for automated alerts',
      href: `/workspaces/${workspaceId}/settings`,
      actionLabel: monitorStatus === 'done' ? 'Manage in Settings' : 'Set up in Settings',
    },
  ];

  const doneCount = steps.filter((s) => s.status === 'done').length;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            DORA Compliance Checklist
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {doneCount} / {steps.length} complete
          </span>
        </div>
        {/* progress bar */}
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0 divide-y">
        {steps.map((step) => (
          <div key={step.n} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <StatusIcon status={step.status} />
            <step.Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">{step.title}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{step.detail}</p>
            </div>
            <StatusBadge status={step.status} />
            {step.href && step.actionLabel && (
              <Button
                size="sm"
                variant={step.status === 'pending' ? 'default' : 'outline'}
                className="shrink-0 h-7 px-2.5 text-xs"
                onClick={() => router.push(step.href!)}
              >
                {step.actionLabel}
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Monitoring Dashboard ─────────────────────────────────────────────────────

/** Returns days remaining (positive) or days overdue (negative). */
function daysFrom(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - new Date().getTime()) / 86_400_000);
}

function DaysChip({ days, suffix = '' }: { days: number; suffix?: string }) {
  if (days < 0)
    return <span className="text-xs font-medium text-destructive">{Math.abs(days)}d overdue</span>;
  if (days <= 7)
    return <span className="text-xs font-medium text-destructive">in {days}d{suffix}</span>;
  if (days <= 30)
    return <span className="text-xs font-medium text-amber-600">in {days}d{suffix}</span>;
  if (days <= 90)
    return <span className="text-xs font-medium text-amber-500">in {days}d{suffix}</span>;
  return <span className="text-xs font-medium text-green-600">in {days}d{suffix}</span>;
}

interface MonitoringSignal {
  label: string;
  value: string;
  days: number | null;
  status: 'ok' | 'warning' | 'critical' | 'missing';
}

function SignalRow({ signal }: { signal: MonitoringSignal }) {
  const Icon =
    signal.status === 'ok'       ? ShieldCheck
    : signal.status === 'warning'  ? AlertTriangle
    : signal.status === 'critical' ? XCircle
    : Circle;
  const iconColor =
    signal.status === 'ok'       ? 'text-green-500'
    : signal.status === 'warning'  ? 'text-amber-500'
    : signal.status === 'critical' ? 'text-destructive'
    : 'text-muted-foreground/40';

  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 border-b last:border-0">
      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{signal.label}</span>
        <span className="text-xs text-muted-foreground ml-2">{signal.value}</span>
      </div>
      {signal.days !== null ? (
        <DaysChip days={signal.days} />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}

function MonitoringDashboard({
  workspace,
  assessments,
}: {
  workspace: WorkspaceWithMembership;
  assessments: Assessment[];
}) {
  const workspaceId = workspace.id;
  const hasCerts    = (workspace.certifications?.length ?? 0) > 0;
  const hasReview   = !!workspace.nextReviewDate;
  const isConfigured = hasCerts || hasReview || !!workspace.contractEnd;

  if (!isConfigured) {
    return (
      <Card className="mb-4 border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <BellOff className="h-9 w-9 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Monitoring not configured</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Add certifications, contract end date, or a next review date to enable automated
              24-hour compliance alert emails.
            </p>
          </div>
          <Link href={`/workspaces/${workspaceId}/settings`}>
            <Button size="sm" variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Configure in Settings
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Build signal list
  const signals: MonitoringSignal[] = [];

  // Certifications
  for (const cert of workspace.certifications ?? []) {
    const d = daysFrom(cert.validUntil);
    signals.push({
      label: cert.type,
      value: cert.validUntil ? `expires ${format(new Date(cert.validUntil), 'dd MMM yyyy')}` : '',
      days: d,
      status:
        d === null       ? 'missing'
        : d < 0          ? 'critical'
        : d <= 30        ? 'critical'
        : d <= 90        ? 'warning'
        : 'ok',
    });
  }

  // Contract renewal
  if (workspace.contractEnd) {
    const d = daysFrom(workspace.contractEnd);
    signals.push({
      label: 'Contract renewal',
      value: `ends ${format(new Date(workspace.contractEnd), 'dd MMM yyyy')}`,
      days: d,
      status:
        d === null  ? 'missing'
        : d < 0     ? 'critical'
        : d <= 30   ? 'critical'
        : d <= 60   ? 'warning'
        : 'ok',
    });
  }

  // Annual review
  if (workspace.nextReviewDate) {
    const d = daysFrom(workspace.nextReviewDate);
    signals.push({
      label: 'Annual review',
      value: `due ${format(new Date(workspace.nextReviewDate), 'dd MMM yyyy')}`,
      days: d,
      status:
        d === null  ? 'missing'
        : d < 0     ? 'critical'
        : d <= 30   ? 'warning'
        : 'ok',
    });
  }

  // Last assessment
  const lastAssessment = assessments
    .filter((a) => a.status === 'complete')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
  const assessmentDaysAgo = lastAssessment
    ? Math.floor((new Date().getTime() - new Date(lastAssessment.createdAt).getTime()) / 86_400_000)
    : null;
  signals.push({
    label: 'Last DORA assessment',
    value: lastAssessment
      ? `run ${format(new Date(lastAssessment.createdAt), 'dd MMM yyyy')} (${assessmentDaysAgo}d ago)`
      : 'No assessment run yet',
    days: lastAssessment ? -(assessmentDaysAgo ?? 0) : null,   // negative = "ago" display
    status: !lastAssessment ? 'missing' : (assessmentDaysAgo ?? 0) > 365 ? 'warning' : 'ok',
  });

  const criticalCount = signals.filter((s) => s.status === 'critical').length;
  const warningCount  = signals.filter((s) => s.status === 'warning').length;

  const overallStatus =
    criticalCount > 0 ? 'critical'
    : warningCount > 0 ? 'warning'
    : 'ok';

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Automated Monitoring
            </CardTitle>
            <Badge
              className={
                overallStatus === 'ok'
                  ? 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100 text-xs'
                  : overallStatus === 'warning'
                  ? 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-xs'
                  : 'text-xs'
              }
              variant={overallStatus === 'critical' ? 'destructive' : 'outline'}
            >
              {overallStatus === 'ok' ? '● Active' : overallStatus === 'warning' ? '⚠ Attention' : '✕ Action required'}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            24h scan
          </div>
        </div>
        {(criticalCount > 0 || warningCount > 0) && (
          <p className="text-xs text-muted-foreground mt-1">
            {criticalCount > 0 && <span className="text-destructive font-medium">{criticalCount} critical · </span>}
            {warningCount > 0  && <span className="text-amber-600 font-medium">{warningCount} warning · </span>}
            Alert emails sent to workspace owner
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0 divide-y-0">
        {signals.map((s, i) => <SignalRow key={i} signal={s} />)}
        {/* Trend shortcut */}
        {lastAssessment && (
          <div className="pt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Last risk: <strong className="ml-1">{lastAssessment.results?.overallRisk ?? '—'}</strong>
              {lastAssessment.results?.gaps?.length != null && (
                <span className="ml-2 text-muted-foreground">
                  ({lastAssessment.results.gaps.filter((g) => g.gapLevel === 'missing').length} missing ·{' '}
                  {lastAssessment.results.gaps.filter((g) => g.gapLevel === 'partial').length} partial)
                </span>
              )}
            </span>
            <Link href={`/assessments/${lastAssessment._id}`}>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                View report
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkspacePage({ params }: WorkspacePageProps) {
  const { id } = use(params);
  const router = useRouter();
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const activeWorkspaceId  = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaces         = useWorkspaceStore((state) => state.workspaces);

  const storeWorkspace = workspaces.find((w) => w.id === id);

  useEffect(() => {
    if (storeWorkspace && storeWorkspace.id !== activeWorkspaceId) {
      setActiveWorkspace(storeWorkspace.id);
    }
  }, [storeWorkspace, activeWorkspaceId, setActiveWorkspace]);

  const { data: wsData, isLoading: wsLoading } = useQuery({
    queryKey: ['workspace', id],
    queryFn: async () => {
      const res = await workspacesApi.get(id);
      return res.data?.workspace ?? null;
    },
    enabled: !!id,
  });

  const workspace = wsData ?? storeWorkspace;

  const { data: assessments, isLoading: assLoading, isError: assError } = useQuery({
    queryKey: ['assessments', id],
    queryFn: async () => {
      const res = await assessmentsApi.list({ workspaceId: id, limit: 50 });
      return res.data?.assessments ?? [];
    },
    enabled: !!id,
  });

  const { data: questionnaires } = useQuery({
    queryKey: ['questionnaires', id],
    queryFn: async () => {
      const res = await questionnairesApi.list({ workspaceId: id });
      return (res.data?.questionnaires ?? []) as VendorQuestionnaire[];
    },
    enabled: !!id,
  });

  const isOwner = workspace?.myRole === 'owner' || storeWorkspace?.membership?.role === 'owner';

  if (!workspace && wsLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  const hasVendorProfile =
    workspace.vendorTier || workspace.country || workspace.serviceType ||
    workspace.contractStart || workspace.contractEnd;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/workspaces">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Vendors
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{workspace.name}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {workspace.vendorTier   && <TierBadge tier={workspace.vendorTier} />}
              {workspace.vendorStatus && <VendorStatusBadge status={workspace.vendorStatus} />}
              {workspace.description  && (
                <span className="text-sm text-muted-foreground">{workspace.description}</span>
              )}
            </div>
          </div>
        </div>
        {isOwner && (
          <Link href={`/workspaces/${id}/settings`}>
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        )}
      </div>

      {/* ── DORA Compliance Checklist ─────────────────────────────────────── */}
      <ComplianceChecklist
        workspace={workspace}
        assessments={assessments ?? []}
        questionnaires={questionnaires ?? []}
      />

      {/* ── Monitoring Dashboard (Step 5) ─────────────────────────────────── */}
      <MonitoringDashboard
        workspace={workspace}
        assessments={assessments ?? []}
      />

      {/* Profile + Contract row */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {workspace.serviceType && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize">{workspace.serviceType}</span>
              </div>
            )}
            {workspace.country && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>{workspace.country}</span>
              </div>
            )}
            {!hasVendorProfile && (
              <p className="text-muted-foreground text-sm">
                No vendor profile data —{' '}
                {isOwner ? (
                  <Link href={`/workspaces/${id}/settings`} className="underline underline-offset-2">
                    add details in Settings
                  </Link>
                ) : (
                  'contact the workspace owner'
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Contract
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {workspace.contractStart && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Start: {format(new Date(workspace.contractStart), 'dd MMM yyyy')}</span>
              </div>
            )}
            {workspace.contractEnd && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>End: {format(new Date(workspace.contractEnd), 'dd MMM yyyy')}</span>
                <ContractDaysChip contractEnd={workspace.contractEnd} />
              </div>
            )}
            {workspace.nextReviewDate && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>Next review: {format(new Date(workspace.nextReviewDate), 'dd MMM yyyy')}</span>
              </div>
            )}
            {!workspace.contractStart && !workspace.contractEnd && !workspace.nextReviewDate && (
              <p className="text-muted-foreground">No contract dates set</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* DORA Gap Assessments */}
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
          {assLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : assError ? (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-md border border-destructive/30 bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Failed to load assessments.
            </div>
          ) : assessments && assessments.length > 0 ? (
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
                  {assessments.map((a: Assessment) => (
                    <TableRow
                      key={a._id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/assessments/${a._id}`)}
                    >
                      <TableCell className="font-medium">{a.vendorName}</TableCell>
                      <TableCell className="text-muted-foreground">{a.name}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[a.status]}>
                          {(a.status === 'indexing' || a.status === 'analyzing') && (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          )}
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
    </div>
  );
}
