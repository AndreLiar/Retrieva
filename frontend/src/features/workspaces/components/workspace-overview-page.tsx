'use client';

import { use } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { AlertTriangle, ArrowLeft, Building2, Calendar, Globe, Loader2 } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ComplianceChecklistCard } from '@/features/workspaces/components/compliance-checklist-card';
import { ComplianceScoreCard } from '@/features/workspaces/components/compliance-score-card';
import { MonitoringCard } from '@/features/workspaces/components/monitoring-card';
import { WorkspaceAssessmentsCard } from '@/features/workspaces/components/workspace-assessments-card';
import { WorkspaceHeader } from '@/features/workspaces/components/workspace-header';
import { useWorkspaceOverview } from '@/features/workspaces/hooks/use-workspace-overview';

function ContractDaysChip({ contractEnd }: { contractEnd: string }) {
  const days = Math.ceil((new Date(contractEnd).getTime() - new Date().getTime()) / 86_400_000);
  const color = days < 30 ? 'text-destructive' : days < 90 ? 'text-warning' : 'text-success';
  return (
    <span className={`text-xs font-medium ${color}`}>
      ({days < 0 ? `${Math.abs(days)}d overdue` : `+${days}d`})
    </span>
  );
}

interface WorkspaceOverviewPageProps {
  params: Promise<{ id: string }>;
}

export function WorkspaceOverviewPage({ params }: WorkspaceOverviewPageProps) {
  const { id } = use(params);
  const {
    workspace,
    isWorkspaceLoading,
    assessments,
    isAssessmentsLoading,
    isAssessmentsError,
    questionnaires,
    complianceScore,
  } = useWorkspaceOverview(id);

  if (!workspace && isWorkspaceLoading) {
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

  const isOwner = workspace.membership.role === 'owner';
  const hasVendorProfile =
    workspace.vendorTier ||
    workspace.country ||
    workspace.serviceType ||
    workspace.contractStart ||
    workspace.contractEnd;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/workspaces">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Vendors
        </Button>
      </Link>

      <WorkspaceHeader workspace={workspace} workspaceId={id} isOwner={isOwner} />

      <ComplianceScoreCard score={complianceScore} />

      <ComplianceChecklistCard
        workspace={workspace}
        assessments={assessments}
        questionnaires={questionnaires}
      />

      <MonitoringCard workspace={workspace} assessments={assessments} />

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
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span>Next review: {format(new Date(workspace.nextReviewDate), 'dd MMM yyyy')}</span>
              </div>
            )}
            {!workspace.contractStart && !workspace.contractEnd && !workspace.nextReviewDate && (
              <p className="text-muted-foreground">No contract dates set</p>
            )}
          </CardContent>
        </Card>
      </div>

      <WorkspaceAssessmentsCard
        assessments={assessments}
        isLoading={isAssessmentsLoading}
        isError={isAssessmentsError}
      />
    </div>
  );
}
