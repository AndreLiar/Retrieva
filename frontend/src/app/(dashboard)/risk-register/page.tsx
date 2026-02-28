'use client';

/**
 * Vendor Risk Register — portfolio-level DORA compliance view
 *
 * Shows all vendor workspaces as rows with columns:
 *   Vendor · Tier · Service · DORA Risk · Gaps · Q Score · Contract · Certs · Next Review · Status
 *
 * This is the Art. 28(3) Register of Information in UI form.
 * The RoI Excel export (EBA Master Template) is available on the Questionnaires page.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Building2,
  FileDown,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { assessmentsApi } from '@/lib/api/assessments';
import { questionnairesApi } from '@/lib/api/questionnaires';
import { workspacesApi } from '@/lib/api/workspaces';
import type { Assessment, OverallRisk } from '@/lib/api/assessments';
import type { VendorQuestionnaire } from '@/lib/api/questionnaires';
import type { WorkspaceWithMembership } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysFrom(date: string | null | undefined): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - new Date().getTime()) / 86_400_000);
}

function RiskBadge({ risk }: { risk: OverallRisk | null | undefined }) {
  if (!risk) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <Badge
      variant={risk === 'High' ? 'destructive' : risk === 'Medium' ? 'secondary' : 'default'}
      className="text-xs"
    >
      {risk}
    </Badge>
  );
}

function TierBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return <span className="text-muted-foreground text-xs">—</span>;
  if (tier === 'critical')
    return <Badge variant="destructive" className="text-xs">Critical</Badge>;
  if (tier === 'important')
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 text-xs">Important</Badge>;
  return <Badge variant="outline" className="text-xs">Standard</Badge>;
}

function ComplianceStatus({ steps }: { steps: number }) {
  if (steps === 5) return <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle2 className="h-3.5 w-3.5" />Complete</span>;
  if (steps >= 3)  return <span className="flex items-center gap-1 text-amber-600 text-xs font-medium"><AlertTriangle className="h-3.5 w-3.5" />{steps}/5 steps</span>;
  return <span className="flex items-center gap-1 text-muted-foreground text-xs"><Circle className="h-3.5 w-3.5" />{steps}/5 steps</span>;
}

function CertChip({ days }: { days: number | null }) {
  if (days === null) return <span className="text-muted-foreground text-xs">—</span>;
  if (days < 0)  return <span className="text-xs font-medium text-destructive">Expired</span>;
  if (days <= 30) return <span className="text-xs font-medium text-destructive">{days}d</span>;
  if (days <= 90) return <span className="text-xs font-medium text-amber-600">{days}d</span>;
  return <span className="text-xs font-medium text-green-600">{days}d</span>;
}

// ── Risk register row data builder ────────────────────────────────────────────

interface RegisterRow {
  workspace:         WorkspaceWithMembership;
  latestDora:        Assessment | null;
  latestA30:         Assessment | null;
  latestQ:           VendorQuestionnaire | null;
  stepsComplete:     number;
  nearestCertDays:   number | null;
  contractDays:      number | null;
  reviewDays:        number | null;
}

function buildRow(
  workspace: WorkspaceWithMembership,
  assessments: Assessment[],
  questionnaires: VendorQuestionnaire[]
): RegisterRow {
  const wsAssessments = assessments.filter((a) => a.workspaceId === workspace.id);
  const wsQs          = questionnaires.filter((q) => q.workspaceId === workspace.id);

  const latestDora = wsAssessments
    .filter((a) => a.framework === 'DORA' && a.status === 'complete')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

  const latestA30 = wsAssessments
    .filter((a) => a.framework === 'CONTRACT_A30' && a.status === 'complete')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

  const latestQ = wsQs
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0] ?? null;

  // Step completion count (mirrors ComplianceChecklist logic)
  let steps = 0;
  if (workspace.vendorTier && workspace.serviceType) steps++;
  if (latestQ?.status === 'complete') steps++;
  if (latestDora) steps++;
  if (latestA30) steps++;
  if ((workspace.certifications?.length ?? 0) > 0 && workspace.nextReviewDate) steps++;

  // Nearest cert expiry
  const certDays = (workspace.certifications ?? [])
    .map((c) => daysFrom(c.validUntil))
    .filter((d): d is number => d !== null);
  const nearestCertDays = certDays.length > 0 ? Math.min(...certDays) : null;

  return {
    workspace,
    latestDora,
    latestA30,
    latestQ,
    stepsComplete: steps,
    nearestCertDays,
    contractDays: daysFrom(workspace.contractEnd),
    reviewDays:   daysFrom(workspace.nextReviewDate),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RiskRegisterPage() {
  const router     = useRouter();
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  // Fetch full workspace details (certifications etc. may not be in store)
  const { data: allWorkspaces, isLoading: wsLoading } = useQuery({
    queryKey: ['workspaces-list'],
    queryFn: async () => {
      const res = await workspacesApi.list();
      return (res.data?.workspaces ?? []) as WorkspaceWithMembership[];
    },
  });

  // All assessments across all workspaces (no workspaceId filter)
  const { data: allAssessments, isLoading: assLoading } = useQuery({
    queryKey: ['all-assessments'],
    queryFn: async () => {
      const res = await assessmentsApi.list({ limit: 500 });
      return res.data?.assessments ?? [];
    },
  });

  // All questionnaires across all workspaces
  const { data: allQuestionnaires, isLoading: qLoading } = useQuery({
    queryKey: ['all-questionnaires'],
    queryFn: async () => {
      const res = await questionnairesApi.list({});
      return (res.data?.questionnaires ?? []) as VendorQuestionnaire[];
    },
  });

  const isLoading = wsLoading || assLoading || qLoading;

  const rows: RegisterRow[] = useMemo(() => {
    const ws  = allWorkspaces ?? workspaces;
    const ass = allAssessments ?? [];
    const qs  = allQuestionnaires ?? [];
    return ws.map((w) => buildRow(w as WorkspaceWithMembership, ass, qs));
  }, [allWorkspaces, workspaces, allAssessments, allQuestionnaires]);

  // Summary stats
  const highRiskCount  = rows.filter((r) => r.latestDora?.results?.overallRisk === 'High').length;
  const completeCount  = rows.filter((r) => r.stepsComplete === 5).length;
  const expiringCount  = rows.filter((r) => r.nearestCertDays !== null && r.nearestCertDays <= 90).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendor Risk Register</h1>
          <p className="text-sm text-muted-foreground mt-1">
            DORA Art. 28(3) — portfolio-level ICT third-party risk overview
          </p>
        </div>
        <Link href="/questionnaires">
          <Button variant="outline" size="sm">
            <FileDown className="h-4 w-4 mr-2" />
            Export RoI (Excel)
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total vendors',       value: rows.length,    color: '' },
          { label: 'High risk',           value: highRiskCount,  color: highRiskCount > 0 ? 'text-destructive' : 'text-green-600' },
          { label: 'Fully compliant',     value: completeCount,  color: 'text-green-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border p-4 text-center">
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      {expiringCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {expiringCount} vendor{expiringCount > 1 ? 's' : ''} with certifications expiring within 90 days
        </div>
      )}

      {/* Register table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">No vendors yet.</p>
          <Button size="sm" onClick={() => router.push('/workspaces')}>Add your first vendor</Button>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Vendor</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>DORA Risk</TableHead>
                <TableHead>Gaps</TableHead>
                <TableHead>Q Score</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Certs</TableHead>
                <TableHead>Next Review</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ workspace, latestDora, latestA30, latestQ, stepsComplete, nearestCertDays, reviewDays }) => {
                const missing = latestDora?.results?.gaps.filter((g) => g.gapLevel === 'missing').length ?? null;
                const partial = latestDora?.results?.gaps.filter((g) => g.gapLevel === 'partial').length ?? null;
                const qScore  = latestQ?.status === 'complete' ? (latestQ.overallScore ?? null) : null;
                const contractOk = latestA30?.status === 'complete' &&
                  (latestA30.results?.gaps.filter((g) => g.gapLevel === 'missing').length ?? 0) === 0;

                return (
                  <TableRow
                    key={workspace.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/workspaces/${workspace.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {workspace.name}
                      </div>
                    </TableCell>
                    <TableCell><TierBadge tier={workspace.vendorTier} /></TableCell>
                    <TableCell>
                      <span className="text-xs capitalize text-muted-foreground">
                        {workspace.serviceType ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <RiskBadge risk={latestDora?.results?.overallRisk} />
                    </TableCell>
                    <TableCell>
                      {latestDora ? (
                        <span className="text-xs">
                          <span className="text-destructive font-medium">{missing}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-amber-600 font-medium">{partial}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {qScore !== null ? (
                        <span className={`text-xs font-medium ${qScore >= 70 ? 'text-green-600' : qScore >= 40 ? 'text-amber-600' : 'text-destructive'}`}>
                          {qScore}/100
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {latestA30 ? (
                        contractOk
                          ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />OK</span>
                          : <span className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />Gaps</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell><CertChip days={nearestCertDays} /></TableCell>
                    <TableCell>
                      {reviewDays !== null ? (
                        <span className={`text-xs font-medium ${reviewDays < 0 ? 'text-destructive' : reviewDays <= 30 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {reviewDays < 0 ? `${Math.abs(reviewDays)}d overdue` : format(new Date(workspace.nextReviewDate!), 'dd MMM yy')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell><ComplianceStatus steps={stepsComplete} /></TableCell>
                    <TableCell>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
