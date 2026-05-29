'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Building2, Settings } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import type { VendorTier, VendorStatus, WorkspaceWithMembership } from '@/types';

function TierBadge({ tier }: { tier: VendorTier }) {
  const { t } = useTranslation();
  if (tier === 'critical') return <Badge variant="destructive">{t('workspaces.tier.critical')}</Badge>;
  if (tier === 'important') {
    return (
      <Badge className="bg-warning-muted text-warning border-warning-muted hover:bg-warning-muted">
        {t('workspaces.tier.important')}
      </Badge>
    );
  }
  return <Badge variant="outline">{t('workspaces.tier.standard')}</Badge>;
}

function VendorStatusBadge({ status }: { status: VendorStatus }) {
  const { t } = useTranslation();
  if (status === 'active') return <Badge variant="default">{t('workspaces.status.active')}</Badge>;
  if (status === 'under-review') return <Badge variant="secondary">{t('workspaces.status.underReview')}</Badge>;
  return <Badge variant="outline">{t('workspaces.status.exited')}</Badge>;
}

interface WorkspaceHeaderProps {
  workspace: WorkspaceWithMembership;
  workspaceId: string;
  isOwner: boolean;
}

export function WorkspaceHeader({
  workspace,
  workspaceId,
  isOwner,
}: WorkspaceHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
          <Building2 className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="page-title">{workspace.name}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {workspace.vendorTier && <TierBadge tier={workspace.vendorTier} />}
            {workspace.vendorStatus && <VendorStatusBadge status={workspace.vendorStatus} />}
            {workspace.description && (
              <span className="text-sm text-muted-foreground">{workspace.description}</span>
            )}
          </div>
        </div>
      </div>
      {isOwner && (
        <Link href={`/workspaces/${workspaceId}/settings`}>
          <Button variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            {t('workspaces.header.settings')}
          </Button>
        </Link>
      )}
    </div>
  );
}
