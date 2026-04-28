'use client';

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  FileSearch,
  FileText,
} from 'lucide-react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import type { Assessment } from '@/features/assessments/api/assessments';
import type { VendorQuestionnaire } from '@/features/questionnaires/api/questionnaires';
import type { WorkspaceWithMembership } from '@/types';

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
  if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-success shrink-0" />;
  if (status === 'in-progress') {
    return <Clock className="h-5 w-5 text-warning shrink-0" />;
  }
  return <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />;
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <Badge className="bg-success-muted text-success border-success-muted hover:bg-success-muted text-xs">
        Done
      </Badge>
    );
  }
  if (status === 'in-progress') {
    return (
      <Badge className="bg-warning-muted text-warning border-warning-muted hover:bg-warning-muted text-xs">
        In progress
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      Pending
    </Badge>
  );
}

interface ComplianceChecklistCardProps {
  workspace: WorkspaceWithMembership;
  assessments: Assessment[];
  questionnaires: VendorQuestionnaire[];
}

export function ComplianceChecklistCard({
  workspace,
  assessments,
  questionnaires,
}: ComplianceChecklistCardProps) {
  const router = useRouter();
  const workspaceId = workspace.id;
  const classifyDone = !!(workspace.vendorTier && workspace.serviceType);
  const latestQ = questionnaires[0] ?? null;
  const qStatus: StepStatus =
    latestQ?.status === 'complete'
      ? 'done'
      : latestQ?.status === 'sent' || latestQ?.status === 'partial'
        ? 'in-progress'
        : 'pending';
  const doraAssessments = assessments.filter((assessment) => assessment.framework === 'DORA');
  const latestDora = doraAssessments[0] ?? null;
  const doraStatus: StepStatus =
    latestDora?.status === 'complete'
      ? 'done'
      : latestDora?.status === 'analyzing' || latestDora?.status === 'indexing'
        ? 'in-progress'
        : 'pending';
  const a30Assessments = assessments.filter(
    (assessment) => assessment.framework === 'CONTRACT_A30'
  );
  const latestA30 = a30Assessments[0] ?? null;
  const a30Status: StepStatus =
    latestA30?.status === 'complete'
      ? 'done'
      : latestA30?.status === 'analyzing' || latestA30?.status === 'indexing'
        ? 'in-progress'
        : 'pending';
  const hasCerts = (workspace.certifications?.length ?? 0) > 0;
  const hasReview = !!workspace.nextReviewDate;
  const monitorStatus: StepStatus =
    hasCerts && hasReview ? 'done' : hasCerts || hasReview ? 'in-progress' : 'pending';

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
        qStatus === 'done'
          ? `Score ${latestQ?.overallScore ?? '—'}/100 · submitted ${latestQ?.respondedAt ? format(new Date(latestQ.respondedAt), 'dd MMM yyyy') : '—'}`
          : qStatus === 'in-progress'
            ? `Sent to ${latestQ?.vendorEmail ?? 'vendor'} · awaiting response`
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
        doraStatus === 'done'
          ? `Risk: ${latestDora?.results?.overallRisk ?? '—'} · ${format(new Date(latestDora!.createdAt), 'dd MMM yyyy')}`
          : doraStatus === 'in-progress'
            ? 'Indexing documents…'
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
        a30Status === 'done'
          ? `All 12 Art.30 clauses checked · ${format(new Date(latestA30!.createdAt), 'dd MMM yyyy')}`
          : a30Status === 'in-progress'
            ? 'Reviewing contract clauses…'
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
        monitorStatus === 'done'
          ? `${workspace.certifications?.length} cert(s) tracked · next review ${format(new Date(workspace.nextReviewDate!), 'dd MMM yyyy')}`
          : monitorStatus === 'in-progress'
            ? `${hasCerts ? 'Certifications added' : 'Next review date set'} · add the other field`
            : 'Add certifications and next review date for automated alerts',
      href: `/workspaces/${workspaceId}/settings`,
      actionLabel: monitorStatus === 'done' ? 'Manage in Settings' : 'Set up in Settings',
    },
  ];

  const doneCount = steps.filter((step) => step.status === 'done').length;

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
