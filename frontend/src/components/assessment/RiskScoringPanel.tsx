'use client';

/**
 * RiskScoringPanel — Step 3 gap fixes
 *
 * Adds to DORA gap analysis reports:
 *  1. Inherent vs Residual risk panel
 *  2. Weighted DORA domain breakdown
 *  3. Formal risk decision (proceed / conditional / reject)
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ShieldCheck,
  TrendingDown,
  Minus,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { assessmentsApi } from '@/lib/api/assessments';
import type { Assessment, OverallRisk, RiskDecision, RiskDecisionValue } from '@/lib/api/assessments';
import type { WorkspaceWithMembership } from '@/types';

// ── Domain weights (DORA Art. 28–30) ──────────────────────────────────────────

const DOMAIN_WEIGHTS: Record<string, number> = {
  'ICT Governance':      0.20,
  'Security Controls':   0.25,
  'Incident Management': 0.20,
  'Business Continuity': 0.15,
  'Audit Rights':        0.05,
  'Subcontracting':      0.05,
  'Data Governance':     0.05,
  'Exit Planning':       0.03,
  'Regulatory History':  0.02,
};

// ── Inherent risk matrix ───────────────────────────────────────────────────────

function computeInherentRisk(
  vendorTier: string | null | undefined,
  serviceType: string | null | undefined
): OverallRisk {
  const tier    = vendorTier  ?? 'standard';
  const service = serviceType ?? 'other';

  if (tier === 'critical') return 'High';
  if (tier === 'important' && (service === 'cloud' || service === 'data' || service === 'network')) return 'High';
  if (tier === 'important') return 'Medium';
  return 'Low';
}

const RISK_COLOR: Record<OverallRisk, string> = {
  High:   'text-destructive',
  Medium: 'text-amber-600',
  Low:    'text-green-600',
};

const RISK_BG: Record<OverallRisk, string> = {
  High:   'bg-destructive/10 border-destructive/30',
  Medium: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800',
  Low:    'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800',
};

// ── 1. Inherent vs Residual panel ─────────────────────────────────────────────

export function InherentResidualPanel({
  assessment,
  workspace,
}: {
  assessment: Assessment;
  workspace: WorkspaceWithMembership | null;
}) {
  const residualRisk   = assessment.results?.overallRisk;
  const inherentRisk   = computeInherentRisk(workspace?.vendorTier, workspace?.serviceType);
  if (!residualRisk) return null;

  const riskOrder: Record<OverallRisk, number> = { Low: 0, Medium: 1, High: 2 };
  const reduced = riskOrder[residualRisk] < riskOrder[inherentRisk];
  const same    = residualRisk === inherentRisk;

  const ArrowIcon = reduced ? TrendingDown : same ? Minus : ArrowRight;
  const arrowColor = reduced ? 'text-green-500' : same ? 'text-muted-foreground' : 'text-destructive';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Risk Scoring
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 items-center gap-3">
          {/* Inherent risk */}
          <div className={`rounded-lg border p-3 text-center ${RISK_BG[inherentRisk]}`}>
            <p className="text-xs text-muted-foreground mb-1">Inherent risk</p>
            <p className={`text-lg font-bold ${RISK_COLOR[inherentRisk]}`}>{inherentRisk}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {workspace?.vendorTier ?? 'unclassified'} · {workspace?.serviceType ?? 'unknown'}
            </p>
          </div>
          {/* Arrow */}
          <div className="flex flex-col items-center gap-1">
            <ArrowIcon className={`h-6 w-6 ${arrowColor}`} />
            <span className="text-xs text-muted-foreground">
              {reduced ? 'reduced by controls' : same ? 'unchanged' : 'elevated by gaps'}
            </span>
          </div>
          {/* Residual risk */}
          <div className={`rounded-lg border p-3 text-center ${RISK_BG[residualRisk]}`}>
            <p className="text-xs text-muted-foreground mb-1">Residual risk</p>
            <p className={`text-lg font-bold ${RISK_COLOR[residualRisk]}`}>{residualRisk}</p>
            <p className="text-xs text-muted-foreground mt-1">after vendor controls</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Inherent risk is derived from vendor classification ({workspace?.vendorTier ?? '—'}) and
          service type ({workspace?.serviceType ?? '—'}) before any controls are applied. Residual
          risk is the AI-assessed remaining risk after evaluating vendor documentation.
        </p>
      </CardContent>
    </Card>
  );
}

// ── 2. Weighted domain breakdown ──────────────────────────────────────────────

export function WeightedDomainChart({ assessment }: { assessment: Assessment }) {
  const gaps = assessment.results?.gaps ?? [];
  if (gaps.length === 0) return null;

  // Group gaps by domain
  const domainMap: Record<string, { covered: number; partial: number; missing: number }> = {};
  for (const gap of gaps) {
    const d = gap.domain ?? 'Unknown';
    if (!domainMap[d]) domainMap[d] = { covered: 0, partial: 0, missing: 0 };
    domainMap[d][gap.gapLevel]++;
  }

  // Score each domain: covered=1, partial=0.5, missing=0
  const domainScores = Object.entries(domainMap).map(([domain, counts]) => {
    const total = counts.covered + counts.partial + counts.missing;
    const score = total > 0 ? ((counts.covered + counts.partial * 0.5) / total) * 100 : 100;
    const weight = DOMAIN_WEIGHTS[domain] ?? 0;
    return { domain, score, weight, counts, total };
  });

  // Sort by weight desc, then by score asc (worst first in same weight)
  domainScores.sort((a, b) => b.weight - a.weight || a.score - b.score);

  const weightedTotal = domainScores.reduce((sum, d) => sum + d.score * d.weight, 0);
  const totalWeight   = domainScores.reduce((sum, d) => sum + d.weight, 0);
  const overallScore  = totalWeight > 0 ? Math.round(weightedTotal / totalWeight) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Weighted Domain Coverage
          </CardTitle>
          <span className={`text-sm font-bold ${overallScore >= 70 ? 'text-green-600' : overallScore >= 40 ? 'text-amber-600' : 'text-destructive'}`}>
            {overallScore}% weighted
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {domainScores.map(({ domain, score, weight, counts }) => (
          <div key={domain}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium truncate">{domain}</span>
              <span className="text-muted-foreground ml-2 shrink-0">
                {Math.round(score)}% · {Math.round(weight * 100)}% weight
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-400' : 'bg-destructive'}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
              <span className="text-green-600">{counts.covered} ✓</span>
              <span className="text-amber-600">{counts.partial} ~</span>
              <span className="text-destructive">{counts.missing} ✗</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── 3. Formal risk decision ────────────────────────────────────────────────────

const DECISION_CONFIG = {
  proceed: {
    label: 'Proceed',
    description: 'Vendor risk is acceptable. Proceed to contract review.',
    icon: CheckCircle2,
    color: 'text-green-600',
    badgeClass: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100',
  },
  conditional: {
    label: 'Proceed with Conditions',
    description: 'Acceptable with conditions. Remediation plan required before contract execution.',
    icon: AlertTriangle,
    color: 'text-amber-600',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100',
  },
  reject: {
    label: 'Reject',
    description: 'Residual risk too high. Vendor cannot be onboarded under current controls.',
    icon: XCircle,
    color: 'text-destructive',
    badgeClass: '',
  },
} as const;

export function FormalRiskDecision({
  assessment,
  assessmentId,
}: {
  assessment: Assessment;
  assessmentId: string;
}) {
  const queryClient = useQueryClient();
  const [rationale, setRationale]         = useState('');
  const [pendingDecision, setPending]     = useState<RiskDecisionValue | null>(null);

  const mutation = useMutation({
    mutationFn: ({ decision, rat }: { decision: RiskDecisionValue; rat: string }) =>
      assessmentsApi.setRiskDecision(assessmentId, decision, rat),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', assessmentId] });
      toast.success('Risk decision recorded');
      setPending(null);
      setRationale('');
    },
    onError: () => toast.error('Failed to record decision'),
  });

  const existing: RiskDecision | null | undefined = assessment.riskDecision;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Formal Risk Decision
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {existing ? (
          <>
            {/* Current decision */}
            <div className="flex items-center gap-3">
              {(() => {
                const cfg = DECISION_CONFIG[existing.decision];
                const Icon = cfg.icon;
                return (
                  <>
                    <Icon className={`h-5 w-5 shrink-0 ${cfg.color}`} />
                    <div className="flex-1">
                      <Badge className={`text-xs ${cfg.badgeClass}`} variant={existing.decision === 'reject' ? 'destructive' : 'outline'}>
                        {cfg.label}
                      </Badge>
                      {existing.rationale && (
                        <p className="text-sm text-muted-foreground mt-1">&quot;{existing.rationale}&quot;</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Recorded by {existing.setByName || 'compliance officer'} · {format(new Date(existing.setAt), 'dd MMM yyyy HH:mm')}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
            <p className="text-xs text-muted-foreground">
              To change this decision, record a new one below.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No formal decision recorded yet. Record your compliance decision to proceed to the next
            step or formally reject this vendor.
          </p>
        )}

        {/* Decision buttons */}
        {!pendingDecision ? (
          <div className="flex gap-2 flex-wrap">
            {(['proceed', 'conditional', 'reject'] as const).map((d) => {
              const cfg = DECISION_CONFIG[d];
              const Icon = cfg.icon;
              return (
                <Button
                  key={d}
                  size="sm"
                  variant={d === 'reject' ? 'destructive' : d === 'proceed' ? 'default' : 'outline'}
                  onClick={() => setPending(d)}
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {cfg.label}
                </Button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Recording: <span className={DECISION_CONFIG[pendingDecision].color}>{DECISION_CONFIG[pendingDecision].label}</span>
            </p>
            <Textarea
              placeholder="Rationale (optional) — e.g. 'Acceptable subject to ISO 27001 renewal by Q3'"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              className="text-sm h-20 resize-none"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={pendingDecision === 'reject' ? 'destructive' : 'default'}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ decision: pendingDecision, rat: rationale })}
              >
                {mutation.isPending ? 'Saving…' : 'Confirm'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setPending(null); setRationale(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
