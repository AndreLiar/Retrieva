'use client';

import Link from 'next/link';
import { Building2, Settings } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import type { VendorTier, VendorStatus, WorkspaceWithMembership } from '@/types';

function TierBadge({ tier }: { tier: VendorTier }) {
  if (tier === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (tier === 'important') {
    return (
      <Badge className="bg-warning-muted text-warning border-warning-muted hover:bg-warning-muted">
        Important
      </Badge>
    );
  }
  return <Badge variant="outline">Standard</Badge>;
}

function VendorStatusBadge({ status }: { status: VendorStatus }) {
  if (status === 'active') return <Badge variant="default">Active</Badge>;
  if (status === 'under-review') return <Badge variant="secondary">Under Review</Badge>;
  return <Badge variant="outline">Exited</Badge>;
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
            Settings
          </Button>
        </Link>
      )}
    </div>
  );
}
