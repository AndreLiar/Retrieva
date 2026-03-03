'use client';

/**
 * RiskScoringPanel — DORA Art. 28(3) Quantified Risk Matrix
 *
 * Exports:
 *  1. ResidualRiskMatrix   — Numeric inherent × residual scoring with heat map
 *  2. WeightedDomainChart  — Weighted DORA domain breakdown bars
 *  3. FormalRiskDecision   — Compliance decision (proceed / conditional / reject)
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { assessmentsApi } from '@/lib/api/assessments';
import type { Assessment, OverallRisk, RiskDecision, RiskDecisionValue } from '@/lib/api/assessments';
import type { WorkspaceWithMembership } from '@/types';
import {
  DOMAIN_WEIGHTS,
  FUNCTION_WEIGHT,
  TIER_BASE,
  buildRiskMatrix,
} from '@/lib/risk-scoring';

// ── Shared colour maps ─────────────────────────────────────────────────────────

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

// ── 1. Residual Risk Matrix ────────────────────────────────────────────────────

export function ResidualRiskMatrix({
  assessment,
  workspace,
  qScore = null,
}: {
  assessment: Assessment;
  workspace: WorkspaceWithMembership | null;
  qScore?: number | null;
}) {
  const gaps = assessment.results?.gaps ?? null;
  const m = buildRiskMatrix(
    workspace?.vendorTier,
    workspace?.vendorFunctions,
    gaps,
    qScore,
  );

  // Effective DORA risk label from assessment (overrides computed when present)
  const doraRisk = assessment.results?.overallRisk ?? m.residualRisk;

  // ── Heat-map grid (3×3) ──────────────────────────────────────────────────────
  // Rows: inherent risk level  Col: control effectiveness bracket
  const HEAT: OverallRisk[][] = [
    //  ctrlLow      ctrlMed      ctrlHigh
    ['High',   'High',   'Medium'],  // inherentHigh
    ['Medium', 'Medium', 'Low'],     // inherentMedium
    ['Low',    'Low',    'Low'],     // inherentLow
  ];

  const inherentRow = m.inherentRisk === 'High' ? 0 : m.inherentRisk === 'Medium' ? 1 : 2;
  const ctrlCol     = m.controlEffectiveness < 33 ? 0 : m.controlEffectiveness <= 66 ? 1 : 2;

  const activeFns = (workspace?.vendorFunctions ?? []);
  const fnSum     = activeFns.reduce((s, fn) => s + (FUNCTION_WEIGHT[fn] ?? 0), 0);

  const ctrlLabel =
    m.controlEffectiveness >= 67 ? 'High (>66%)' :
    m.controlEffectiveness >= 33 ? 'Medium (33–66%)' :
    'Low (<33%)';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Residual Risk Matrix
          <span className="ml-auto text-xs font-normal normal-case">DORA Art. 28(3)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Top: three score tiles ── */}
        <div className="grid grid-cols-3 items-center gap-3">
          {/* Inherent */}
          <div className={`rounded-lg border p-3 text-center ${RISK_BG[m.inherentRisk]}`}>
            <p className="text-xs text-muted-foreground mb-1">Inherent</p>
            <p className={`text-2xl font-bold tabular-nums ${RISK_COLOR[m.inherentRisk]}`}>
              {m.inherentScore}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </p>
            <p className={`text-xs font-semibold mt-0.5 ${RISK_COLOR[m.inherentRisk]}`}>{m.inherentRisk}</p>
          </div>

          {/* Operator */}
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <span className="text-lg">×</span>
            <span className="text-xs text-center leading-tight">
              {Math.round(m.residualFactor * 100)}%<br />remaining
            </span>
          </div>

          {/* Residual */}
          <div className={`rounded-lg border p-3 text-center ${RISK_BG[doraRisk]}`}>
            <p className="text-xs text-muted-foreground mb-1">Residual</p>
            <p className={`text-2xl font-bold tabular-nums ${RISK_COLOR[doraRisk]}`}>
              {m.residualScore}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </p>
            <p className={`text-xs font-semibold mt-0.5 ${RISK_COLOR[doraRisk]}`}>{doraRisk}</p>
          </div>
        </div>

        {/* ── Input breakdown ── */}
        <div className="rounded-md bg-muted/40 border px-3 py-2.5 text-xs space-y-1.5">
          <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Input Breakdown</p>

          {/* Tier row */}
          <div className="flex justify-between">
            <span>Tier ({workspace?.vendorTier ?? 'standard'})</span>
            <span className="font-mono text-muted-foreground">base {TIER_BASE[workspace?.vendorTier ?? 'standard']}/100</span>
          </div>

          {/* Functions */}
          {activeFns.length > 0 && (
            <div className="flex justify-between">
              <span>{activeFns.length} ICT function{activeFns.length !== 1 ? 's' : ''}</span>
              <span className="font-mono text-muted-foreground">+{fnSum}</span>
            </div>
          )}

          <div className="border-t pt-1 flex justify-between font-medium">
            <span>Inherent score</span>
            <span className={`font-mono ${RISK_COLOR[m.inherentRisk]}`}>{m.inherentScore}/100</span>
          </div>

          {/* Domain coverage */}
          {m.domainCoverage !== null && (
            <div className="flex justify-between">
              <span>DORA gap coverage</span>
              <span className="font-mono text-muted-foreground">{m.domainCoverage}%</span>
            </div>
          )}

          {/* Q score */}
          {m.qScore !== null && (
            <div className="flex justify-between">
              <span>Questionnaire score</span>
              <span className="font-mono text-muted-foreground">{m.qScore}/100</span>
            </div>
          )}

          <div className="border-t pt-1 flex justify-between font-medium">
            <span>Control effectiveness</span>
            <span className={`font-mono ${m.controlEffectiveness >= 67 ? 'text-green-600' : m.controlEffectiveness >= 33 ? 'text-amber-600' : 'text-destructive'}`}>
              {m.controlEffectiveness}% · {ctrlLabel}
            </span>
          </div>

          {!m.hasData && (
            <p className="text-muted-foreground italic">
              No questionnaire or DORA data yet — control effectiveness defaults to 0%.
            </p>
          )}
        </div>

        {/* ── 3×3 Heat map ── */}
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Risk Matrix</p>
          <div className="grid grid-cols-4 gap-1 text-[10px] text-center">
            {/* Header row */}
            <div />
            {(['Low controls', 'Med controls', 'High controls'] as const).map((h) => (
              <div key={h} className="text-muted-foreground font-medium py-0.5">{h}</div>
            ))}
            {/* Data rows */}
            {(['High', 'Medium', 'Low'] as const).map((inhRisk, rIdx) => (
              <>
                <div key={`lbl-${inhRisk}`} className="text-muted-foreground font-medium flex items-center justify-end pr-1">{inhRisk}</div>
                {[0, 1, 2].map((cIdx) => {
                  const cell = HEAT[rIdx][cIdx];
                  const isActive = rIdx === inherentRow && cIdx === ctrlCol;
                  return (
                    <div
                      key={`${rIdx}-${cIdx}`}
                      className={`rounded py-1.5 font-semibold transition-all
                        ${cell === 'High'   ? 'bg-destructive/15 text-destructive' : ''}
                        ${cell === 'Medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' : ''}
                        ${cell === 'Low'    ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' : ''}
                        ${isActive ? 'ring-2 ring-primary scale-105 shadow-sm' : 'opacity-60'}
                      `}
                    >
                      {cell}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>

        {/* ── Methodology footnote ── */}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Inherent score = tier base + ICT function weights (DORA Art. 28). Control effectiveness
          = Q-score × 40% + gap coverage × 60%. Residual factor floor: 15% (risk is never fully
          eliminated). Formula is deterministic and auditable per Art. 28(3).
        </p>
      </CardContent>
    </Card>
  );
}

// ── Legacy alias — kept so any other import of InherentResidualPanel still works ─

/** @deprecated Use ResidualRiskMatrix */
export const InherentResidualPanel = ResidualRiskMatrix;

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
