'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  AlertTriangle,
  BellOff,
  ChevronRight,
  Circle,
  RefreshCw,
  Settings,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import type { Assessment } from '@/features/assessments/api/assessments';
import type { WorkspaceWithMembership } from '@/types';

function daysFrom(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - new Date().getTime()) / 86_400_000);
}

function DaysChip({ days, suffix = '' }: { days: number; suffix?: string }) {
  const { t } = useTranslation();
  if (days < 0) {
    return <span className="text-xs font-medium text-destructive">{t('workspaces.monitoring.daysOverdue', { days: Math.abs(days) })}</span>;
  }
  const label = `${t('workspaces.monitoring.inDays', { days })}${suffix}`;
  if (days <= 7) {
    return <span className="text-xs font-medium text-destructive">{label}</span>;
  }
  if (days <= 90) {
    return <span className="text-xs font-medium text-warning">{label}</span>;
  }
  return <span className="text-xs font-medium text-success">{label}</span>;
}

interface MonitoringSignal {
  label: string;
  value: string;
  days: number | null;
  status: 'ok' | 'warning' | 'critical' | 'missing';
}

function SignalRow({ signal }: { signal: MonitoringSignal }) {
  const Icon =
    signal.status === 'ok'
      ? ShieldCheck
      : signal.status === 'warning'
        ? AlertTriangle
        : signal.status === 'critical'
          ? XCircle
          : Circle;
  const iconColor =
    signal.status === 'ok'
      ? 'text-success'
      : signal.status === 'warning'
        ? 'text-warning'
        : signal.status === 'critical'
          ? 'text-destructive'
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

interface MonitoringCardProps {
  workspace: WorkspaceWithMembership;
  assessments: Assessment[];
}

export function MonitoringCard({ workspace, assessments }: MonitoringCardProps) {
  const { t } = useTranslation();
  const workspaceId = workspace.id;
  const hasCerts = (workspace.certifications?.length ?? 0) > 0;
  const hasReview = !!workspace.nextReviewDate;
  const isConfigured = hasCerts || hasReview || !!workspace.contractEnd;

  if (!isConfigured) {
    return (
      <Card className="mb-4 border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <BellOff className="h-9 w-9 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('workspaces.monitoring.notConfigured')}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {t('workspaces.monitoring.notConfiguredDesc')}
            </p>
          </div>
          <Link href={`/workspaces/${workspaceId}/settings`}>
            <Button size="sm" variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              {t('workspaces.monitoring.configure')}
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const signals: MonitoringSignal[] = [];

  for (const cert of workspace.certifications ?? []) {
    const days = daysFrom(cert.validUntil);
    signals.push({
      label: cert.type,
      value: cert.validUntil ? t('workspaces.monitoring.certExpires', { date: format(new Date(cert.validUntil), 'dd MMM yyyy') }) : '',
      days,
      status:
        days === null ? 'missing' : days < 0 ? 'critical' : days <= 30 ? 'critical' : days <= 90 ? 'warning' : 'ok',
    });
  }

  if (workspace.contractEnd) {
    const days = daysFrom(workspace.contractEnd);
    signals.push({
      label: t('workspaces.monitoring.contractRenewal'),
      value: t('workspaces.monitoring.contractEnds', { date: format(new Date(workspace.contractEnd), 'dd MMM yyyy') }),
      days,
      status:
        days === null ? 'missing' : days < 0 ? 'critical' : days <= 30 ? 'critical' : days <= 60 ? 'warning' : 'ok',
    });
  }

  if (workspace.nextReviewDate) {
    const days = daysFrom(workspace.nextReviewDate);
    signals.push({
      label: t('workspaces.monitoring.annualReview'),
      value: t('workspaces.monitoring.reviewDue', { date: format(new Date(workspace.nextReviewDate), 'dd MMM yyyy') }),
      days,
      status: days === null ? 'missing' : days < 0 ? 'critical' : days <= 30 ? 'warning' : 'ok',
    });
  }

  const lastAssessment =
    assessments
      .filter((assessment) => assessment.status === 'complete')
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;
  const assessmentDaysAgo = lastAssessment
    ? Math.floor((new Date().getTime() - new Date(lastAssessment.createdAt).getTime()) / 86_400_000)
    : null;

  signals.push({
    label: t('workspaces.monitoring.lastAssessment'),
    value: lastAssessment
      ? t('workspaces.monitoring.assessmentRun', { date: format(new Date(lastAssessment.createdAt), 'dd MMM yyyy'), days: assessmentDaysAgo })
      : t('workspaces.monitoring.noAssessment'),
    days: lastAssessment ? -(assessmentDaysAgo ?? 0) : null,
    status: !lastAssessment ? 'missing' : (assessmentDaysAgo ?? 0) > 365 ? 'warning' : 'ok',
  });

  const criticalCount = signals.filter((signal) => signal.status === 'critical').length;
  const warningCount = signals.filter((signal) => signal.status === 'warning').length;
  const overallStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'ok';

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t('workspaces.monitoring.title')}
            </CardTitle>
            <Badge
              className={
                overallStatus === 'ok'
                  ? 'bg-success-muted text-success border-success-muted hover:bg-success-muted text-xs'
                  : overallStatus === 'warning'
                    ? 'bg-warning-muted text-warning border-warning-muted hover:bg-warning-muted text-xs'
                    : 'text-xs'
              }
              variant={overallStatus === 'critical' ? 'destructive' : 'outline'}
            >
              {overallStatus === 'ok'
                ? t('workspaces.monitoring.statusActive')
                : overallStatus === 'warning'
                  ? t('workspaces.monitoring.statusAttention')
                  : t('workspaces.monitoring.statusActionRequired')}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            {t('workspaces.monitoring.scan')}
          </div>
        </div>
        {(criticalCount > 0 || warningCount > 0) && (
          <p className="text-xs text-muted-foreground mt-1">
            {criticalCount > 0 && (
              <span className="text-destructive font-medium">{t('workspaces.monitoring.criticalCount', { count: criticalCount })}</span>
            )}
            {warningCount > 0 && (
              <span className="text-warning font-medium">{t('workspaces.monitoring.warningCount', { count: warningCount })}</span>
            )}
            {t('workspaces.monitoring.alertEmails')}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0 divide-y-0">
        {signals.map((signal, index) => (
          <SignalRow key={`${signal.label}-${index}`} signal={signal} />
        ))}
        {lastAssessment && (
          <div className="pt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {t('workspaces.monitoring.lastRisk')} <strong className="ml-1">{lastAssessment.results?.overallRisk ?? '—'}</strong>
              {lastAssessment.results?.gaps?.length != null && (
                <span className="ml-2 text-muted-foreground">
                  {t('workspaces.monitoring.gapsSummary', {
                    missing: lastAssessment.results.gaps.filter((gap) => gap.gapLevel === 'missing').length,
                    partial: lastAssessment.results.gaps.filter((gap) => gap.gapLevel === 'partial').length,
                  })}
                </span>
              )}
            </span>
            <Link href={`/assessments/${lastAssessment._id}`}>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                {t('workspaces.monitoring.viewReport')}
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
