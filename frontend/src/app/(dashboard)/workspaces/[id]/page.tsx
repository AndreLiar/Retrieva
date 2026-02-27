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
import type { Assessment, OverallRisk, AssessmentStatus } from '@/lib/api/assessments';
import type { VendorTier, VendorStatus, VendorCertification } from '@/types';

interface WorkspacePageProps {
  params: Promise<{ id: string }>;
}

// ─── Badge variant maps (mirrors assessments/page.tsx) ────────────────────────

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

// ─── Tier badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: VendorTier }) {
  if (tier === 'critical') {
    return <Badge variant="destructive">Critical</Badge>;
  }
  if (tier === 'important') {
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Important</Badge>;
  }
  return <Badge variant="outline">Standard</Badge>;
}

function VendorStatusBadge({ status }: { status: VendorStatus }) {
  if (status === 'active') return <Badge variant="default">Active</Badge>;
  if (status === 'under-review') return <Badge variant="secondary">Under Review</Badge>;
  return <Badge variant="outline">Exited</Badge>;
}

// ─── Contract days remaining ───────────────────────────────────────────────────

function ContractDaysChip({ contractEnd }: { contractEnd: string }) {
  const nowMs = new Date().getTime();
  const days = Math.ceil((new Date(contractEnd).getTime() - nowMs) / 86_400_000);
  const colorClass =
    days < 30 ? 'text-destructive' : days < 90 ? 'text-amber-600' : 'text-green-600';
  const label = days < 0 ? `${Math.abs(days)}d overdue` : `+${days}d`;
  return <span className={`text-xs font-medium ${colorClass}`}>({label})</span>;
}

// ─── Certification badge ───────────────────────────────────────────────────────

function CertBadge({ cert }: { cert: VendorCertification }) {
  const Icon =
    cert.status === 'valid' ? ShieldCheck :
    cert.status === 'expiring-soon' ? AlertTriangle : XCircle;

  const colorClass =
    cert.status === 'valid'
      ? 'bg-green-50 text-green-800 border-green-200'
      : cert.status === 'expiring-soon'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-red-50 text-red-800 border-red-200';

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {cert.type} · valid until {format(new Date(cert.validUntil), 'MMM yyyy')}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function WorkspacePage({ params }: WorkspacePageProps) {
  const { id } = use(params);
  const router = useRouter();
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  const storeWorkspace = workspaces.find((w) => w.id === id);

  useEffect(() => {
    if (storeWorkspace && storeWorkspace.id !== activeWorkspaceId) {
      setActiveWorkspace(storeWorkspace.id);
    }
  }, [storeWorkspace, activeWorkspaceId, setActiveWorkspace]);

  // Fetch full workspace detail (includes vendor fields)
  const { data: wsData, isLoading: wsLoading } = useQuery({
    queryKey: ['workspace', id],
    queryFn: async () => {
      const res = await workspacesApi.get(id);
      return res.data?.workspace ?? null;
    },
    enabled: !!id,
    // Seed from store so page renders immediately
    initialData: storeWorkspace ? undefined : undefined,
  });

  // Prefer API data (has all vendor fields), fall back to store data
  const workspace = wsData ?? storeWorkspace;

  // Fetch assessments for this workspace
  const { data: assessments, isLoading: assLoading, isError: assError } = useQuery({
    queryKey: ['assessments', id],
    queryFn: async () => {
      const res = await assessmentsApi.list({ workspaceId: id, limit: 50 });
      return res.data?.assessments ?? [];
    },
    enabled: !!id,
  });

  const isOwner = workspace?.myRole === 'owner' || storeWorkspace?.membership?.role === 'owner';

  if (!workspace && wsLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
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
      {/* Back button */}
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
              {workspace.vendorTier && <TierBadge tier={workspace.vendorTier} />}
              {workspace.vendorStatus && <VendorStatusBadge status={workspace.vendorStatus} />}
              {workspace.description && (
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

      {/* Profile + Contract row */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        {/* Profile card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {workspace.serviceType ? (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="capitalize">{workspace.serviceType}</span>
              </div>
            ) : null}
            {workspace.country ? (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>{workspace.country}</span>
              </div>
            ) : null}
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

        {/* Contract card */}
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

      {/* Certifications */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Certifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workspace.certifications && workspace.certifications.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {workspace.certifications.map((cert, i) => (
                <CertBadge key={i} cert={cert} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No certifications added.{' '}
              {isOwner && (
                <Link href={`/workspaces/${id}/settings`} className="underline underline-offset-2">
                  Add certifications in Settings
                </Link>
              )}
            </p>
          )}
        </CardContent>
      </Card>

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
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
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
