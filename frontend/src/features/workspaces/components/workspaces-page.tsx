'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Plus, Building2, Users, ChevronRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GettingStartedChecklist } from '@/components/onboarding/GettingStartedChecklist';
import { EmptyState } from '@/components/onboarding/EmptyState';
import { useUIStore, MODAL_IDS } from '@/lib/stores/ui-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useWorkspaceListQuery } from '@/lib/hooks';
import { getRoleDisplayName, getRoleBadgeColor } from '@/lib/utils/permissions';
import type { VendorTier, VendorStatus } from '@/types';

function TierBadge({ tier }: { tier: VendorTier }) {
  const { t } = useTranslation();
  if (tier === 'critical') {
    return <Badge variant="destructive" className="text-xs h-5">{t('workspaces.tier.critical')}</Badge>;
  }
  if (tier === 'important') {
    return <Badge className="text-xs h-5 bg-warning-muted text-warning border-warning-muted hover:bg-warning-muted">{t('workspaces.tier.important')}</Badge>;
  }
  return <Badge variant="outline" className="text-xs h-5">{t('workspaces.tier.standard')}</Badge>;
}

function VendorStatusChip({ status }: { status: VendorStatus }) {
  const { t } = useTranslation();
  if (status === 'active') {
    return null;
  }
  if (status === 'under-review') {
    return <Badge variant="secondary" className="text-xs h-5">{t('workspaces.status.underReview')}</Badge>;
  }
  return <Badge variant="outline" className="text-xs h-5">{t('workspaces.status.exited')}</Badge>;
}

function ContractExpiryBar({ contractEnd }: { contractEnd: string }) {
  const { t } = useTranslation();
  const nowMs = new Date().getTime();
  const days = Math.ceil((new Date(contractEnd).getTime() - nowMs) / 86_400_000);
  if (days > 60) {
    return null;
  }

  const colorClass = days <= 0
    ? 'bg-destructive/10 border-destructive/30 text-destructive'
    : 'bg-warning-muted border-warning-muted text-warning';
  const label = days <= 0
    ? t('workspaces.contractBar.expiredAgo', { days: Math.abs(days) })
    : t('workspaces.contractBar.expiresIn', { days });

  return (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border mt-2 ${colorClass}`}>
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {label}
    </div>
  );
}

export function WorkspacesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: workspaces = [] } = useWorkspaceListQuery();
  const openModal = useUIStore((state) => state.openModal);
  const onboardingChecklist = useAuthStore((state) => state.user?.onboardingChecklist);
  const onboardingCompleted = useAuthStore((state) => state.user?.onboardingCompleted);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const workspaceName = searchParams.get('workspace_name');
    const isNew = searchParams.get('new');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (connected === 'true') {
      if (isNew === 'true') {
        toast.success(t('workspaces.toast.connected', { name: workspaceName }));
      } else {
        toast.success(t('workspaces.toast.reconnected', { name: workspaceName }), {
          description: t('workspaces.toast.reconnectedDesc'),
        });
      }

      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      router.replace('/workspaces', { scroll: false });
    } else if (error) {
      toast.error(t('workspaces.toast.connectFailed'), {
        description: errorDescription || error,
      });
      router.replace('/workspaces', { scroll: false });
    }
  }, [searchParams, router, queryClient, t]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {onboardingChecklist && !onboardingCompleted && !onboardingChecklist.dismissed && (
        <GettingStartedChecklist checklist={onboardingChecklist} />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">{t('workspaces.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('workspaces.subtitle')}
          </p>
        </div>
        <Button onClick={() => openModal(MODAL_IDS.CREATE_WORKSPACE)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('workspaces.newVendor')}
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <EmptyState
          icon={Building2}
          heading={t('workspaces.empty.heading')}
          description={t('workspaces.empty.description')}
          cta={t('workspaces.empty.cta')}
          onAction={() => openModal(MODAL_IDS.CREATE_WORKSPACE)}
          hint={t('workspaces.empty.hint')}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {workspaces.map((workspace) => (
            <Card
              key={workspace.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => router.push(`/workspaces/${workspace.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{workspace.name}</CardTitle>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge
                          variant="secondary"
                          className={getRoleBadgeColor(workspace.membership.role)}
                        >
                          {getRoleDisplayName(workspace.membership.role)}
                        </Badge>
                        {workspace.vendorTier && <TierBadge tier={workspace.vendorTier} />}
                        {workspace.vendorStatus && workspace.vendorStatus !== 'active' && (
                          <VendorStatusChip status={workspace.vendorStatus} />
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                {workspace.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {workspace.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {t('workspaces.team')}
                  </span>
                  {workspace.syncStatus && (
                    <span className="flex items-center gap-1">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          workspace.syncStatus === 'syncing'
                            ? 'bg-yellow-500 animate-pulse'
                            : workspace.syncStatus === 'error'
                              ? 'bg-destructive'
                              : 'bg-success'
                        }`}
                      />
                      {workspace.syncStatus === 'syncing'
                        ? t('workspaces.sync.syncing')
                        : workspace.syncStatus === 'error'
                          ? t('workspaces.sync.error')
                          : t('workspaces.sync.synced')}
                    </span>
                  )}
                </div>
                {workspace.contractEnd && (
                  <ContractExpiryBar contractEnd={workspace.contractEnd} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
