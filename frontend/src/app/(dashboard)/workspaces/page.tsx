'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus,
  Building2,
  Users,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspaceStore } from '@/lib/stores/workspace-store';
import { useUIStore, MODAL_IDS } from '@/lib/stores/ui-store';
import { getRoleDisplayName, getRoleBadgeColor } from '@/lib/utils/permissions';
import type { VendorTier, VendorStatus } from '@/types';

// ─── Vendor badge helpers ─────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: VendorTier }) {
  if (tier === 'critical') {
    return <Badge variant="destructive" className="text-xs h-5">Critical</Badge>;
  }
  if (tier === 'important') {
    return <Badge className="text-xs h-5 bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Important</Badge>;
  }
  return <Badge variant="outline" className="text-xs h-5">Standard</Badge>;
}

function VendorStatusChip({ status }: { status: VendorStatus }) {
  if (status === 'active') return null; // don't clutter cards for the normal case
  if (status === 'under-review') {
    return <Badge variant="secondary" className="text-xs h-5">Under Review</Badge>;
  }
  return <Badge variant="outline" className="text-xs h-5">Exited</Badge>;
}

function ContractExpiryBar({ contractEnd }: { contractEnd: string }) {
  const nowMs = new Date().getTime();
  const days = Math.ceil((new Date(contractEnd).getTime() - nowMs) / 86_400_000);
  if (days > 60) return null;
  const colorClass = days <= 0
    ? 'bg-destructive/10 border-destructive/30 text-destructive'
    : 'bg-amber-50 border-amber-200 text-amber-700';
  const label = days <= 0
    ? `Contract expired ${Math.abs(days)}d ago`
    : `Contract expires in ${days} days`;
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border mt-2 ${colorClass}`}>
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {label}
    </div>
  );
}

export default function WorkspacesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const openModal = useUIStore((state) => state.openModal);

  // Handle OAuth callback query params
  useEffect(() => {
    const connected = searchParams.get('connected');
    const workspaceName = searchParams.get('workspace_name');
    const isNew = searchParams.get('new');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (connected === 'true') {
      if (isNew === 'true') {
        toast.success(`Workspace "${workspaceName}" connected successfully!`, {
          description: 'Your Notion pages are being synced.',
        });
      } else {
        toast.success(`Workspace "${workspaceName}" reconnected`, {
          description: 'Credentials have been updated.',
        });
      }

      fetchWorkspaces();
      queryClient.invalidateQueries({ queryKey: ['notion-workspaces'] });
      router.replace('/workspaces', { scroll: false });
    } else if (error) {
      toast.error('Failed to connect Notion workspace', {
        description: errorDescription || error,
      });
      router.replace('/workspaces', { scroll: false });
    }
  }, [searchParams, router, fetchWorkspaces, queryClient]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="text-muted-foreground">
            Manage your third-party ICT vendors and DORA compliance
          </p>
        </div>
        <Button onClick={() => openModal(MODAL_IDS.CREATE_WORKSPACE)}>
          <Plus className="h-4 w-4 mr-2" />
          New Vendor
        </Button>
      </div>

      {/* Workspace list */}
      {workspaces.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">No vendors yet</h2>
          <p className="text-muted-foreground mb-4">
            Add your first ICT vendor to start tracking DORA compliance
          </p>
          <Button onClick={() => openModal(MODAL_IDS.CREATE_WORKSPACE)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Vendor
          </Button>
        </div>
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
                    Team
                  </span>
                  {workspace.syncStatus && (
                    <span className="flex items-center gap-1">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          workspace.syncStatus === 'syncing'
                            ? 'bg-yellow-500 animate-pulse'
                            : workspace.syncStatus === 'error'
                            ? 'bg-red-500'
                            : 'bg-green-500'
                        }`}
                      />
                      {workspace.syncStatus === 'syncing'
                        ? 'Syncing'
                        : workspace.syncStatus === 'error'
                        ? 'Sync Error'
                        : 'Synced'}
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
