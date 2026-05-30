'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  if (status === 'done') {
    return (
      <Badge className="bg-success-muted text-success border-success-muted hover:bg-success-muted text-xs">
        {t('workspaces.checklist.statusDone')}
      </Badge>
    );
  }
  if (status === 'in-progress') {
    return (
      <Badge className="bg-warning-muted text-warning border-warning-muted hover:bg-warning-muted text-xs">
        {t('workspaces.checklist.statusInProgress')}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      {t('workspaces.checklist.statusPending')}
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
  const { t } = useTranslation();
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
      title: t('workspaces.checklist.s1Title'),
      status: classifyDone ? 'done' : 'pending',
      detail: classifyDone
        ? t('workspaces.checklist.s1DetailDone', { tier: workspace.vendorTier, service: workspace.serviceType })
        : t('workspaces.checklist.s1DetailPending'),
      href: classifyDone ? undefined : `/workspaces/${workspaceId}/settings`,
      actionLabel: classifyDone ? undefined : t('workspaces.checklist.s1Action'),
    },
    {
      n: 2,
      Icon: ClipboardList,
      title: t('workspaces.checklist.s2Title'),
      status: qStatus,
      detail:
        qStatus === 'done'
          ? t('workspaces.checklist.s2DetailDone', { score: latestQ?.overallScore ?? t('workspaces.checklist.emDash'), date: latestQ?.respondedAt ? format(new Date(latestQ.respondedAt), 'dd MMM yyyy') : t('workspaces.checklist.emDash') })
          : qStatus === 'in-progress'
            ? t('workspaces.checklist.s2DetailProgress', { email: latestQ?.vendorEmail ?? t('workspaces.checklist.vendorFallback') })
            : t('workspaces.checklist.s2DetailPending'),
      href: qStatus === 'pending' ? '/questionnaires/new' : `/questionnaires/${latestQ?._id}`,
      actionLabel: qStatus === 'pending' ? t('workspaces.checklist.s2ActionPending') : t('workspaces.checklist.s2ActionView'),
    },
    {
      n: 3,
      Icon: FileSearch,
      title: t('workspaces.checklist.s3Title'),
      status: doraStatus,
      detail:
        doraStatus === 'done'
          ? t('workspaces.checklist.s3DetailDone', { risk: latestDora?.results?.overallRisk ?? t('workspaces.checklist.emDash'), date: format(new Date(latestDora!.createdAt), 'dd MMM yyyy') })
          : doraStatus === 'in-progress'
            ? t('workspaces.checklist.s3DetailProgress')
            : t('workspaces.checklist.s3DetailPending'),
      href: doraStatus === 'pending' ? '/assessments/new' : `/assessments/${latestDora?._id}`,
      actionLabel: doraStatus === 'pending' ? t('workspaces.checklist.s3ActionPending') : t('workspaces.checklist.s3ActionView'),
    },
    {
      n: 4,
      Icon: FileText,
      title: t('workspaces.checklist.s4Title'),
      status: a30Status,
      detail:
        a30Status === 'done'
          ? t('workspaces.checklist.s4DetailDone', { date: format(new Date(latestA30!.createdAt), 'dd MMM yyyy') })
          : a30Status === 'in-progress'
            ? t('workspaces.checklist.s4DetailProgress')
            : t('workspaces.checklist.s4DetailPending'),
      href: a30Status === 'pending' ? '/assessments/new' : `/assessments/${latestA30?._id}`,
      actionLabel: a30Status === 'pending' ? t('workspaces.checklist.s4ActionPending') : t('workspaces.checklist.s4ActionView'),
    },
    {
      n: 5,
      Icon: Bell,
      title: t('workspaces.checklist.s5Title'),
      status: monitorStatus,
      detail:
        monitorStatus === 'done'
          ? t('workspaces.checklist.s5DetailDone', { count: workspace.certifications?.length, date: format(new Date(workspace.nextReviewDate!), 'dd MMM yyyy') })
          : monitorStatus === 'in-progress'
            ? t('workspaces.checklist.s5DetailProgress', { which: hasCerts ? t('workspaces.checklist.certsAdded') : t('workspaces.checklist.reviewSet') })
            : t('workspaces.checklist.s5DetailPending'),
      href: `/workspaces/${workspaceId}/settings`,
      actionLabel: monitorStatus === 'done' ? t('workspaces.checklist.s5ActionDone') : t('workspaces.checklist.s5ActionSetup'),
    },
  ];

  const doneCount = steps.filter((step) => step.status === 'done').length;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {t('workspaces.checklist.title')}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {t('workspaces.checklist.progress', { done: doneCount, total: steps.length })}
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
