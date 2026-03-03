/**
 * risk-scoring.ts — DORA Art. 28(3) quantified risk scoring
 *
 * Formula:
 *   inherentScore  = TIER_BASE[tier] + Σ FUNCTION_WEIGHT[fn]          [0–100]
 *   domainCoverage = weighted DORA gap domain score                    [0–100]
 *   controlEff     = qScore × 0.40 + domainCoverage × 0.60            [0–100]
 *   residualFactor = max(0.15, 1 − controlEff/100)                    [0–1]
 *   residualScore  = round(inherentScore × residualFactor)             [0–100]
 *   riskLevel      = score ≥ 65 → High | 35–64 → Medium | < 35 → Low
 */

import type { Gap, OverallRisk } from '@/lib/api/assessments';
import type { VendorTier, VendorFunction } from '@/types';

// Re-export OverallRisk so callers can import from one place
export type { OverallRisk };

// ── Constants ─────────────────────────────────────────────────────────────────

export const TIER_BASE: Record<VendorTier, number> = {
  critical:  80,
  important: 55,
  standard:  25,
};

export const FUNCTION_WEIGHT: Record<VendorFunction, number> = {
  payment_processing:       8,
  settlement_clearing:      8,
  core_banking:             8,
  risk_management:          4,
  regulatory_reporting:     4,
  fraud_detection:          4,
  identity_access_management: 3,
  network_infrastructure:   3,
  data_storage:             2,
  business_continuity:      2,
};

/** DORA domain weights (Art. 28–30) — same set as WeightedDomainChart */
export const DOMAIN_WEIGHTS: Record<string, number> = {
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

// ── Pure scoring functions ─────────────────────────────────────────────────────

/** Sum tier base + function weights, capped at 100. */
export function computeInherentScore(
  tier: VendorTier | null | undefined,
  functions: VendorFunction[] | null | undefined,
): number {
  const base = TIER_BASE[tier ?? 'standard'] ?? 25;
  const fnSum = (functions ?? []).reduce(
    (acc, fn) => acc + (FUNCTION_WEIGHT[fn] ?? 0),
    0,
  );
  return Math.min(100, base + fnSum);
}

/**
 * Weighted average DORA gap domain score (0–100).
 * Returns null when there are no gaps to score.
 */
export function computeDomainCoverage(
  gaps: Gap[] | null | undefined,
): number | null {
  if (!gaps || gaps.length === 0) return null;

  const domainMap: Record<string, { covered: number; partial: number; missing: number }> = {};
  for (const gap of gaps) {
    const d = gap.domain ?? 'Unknown';
    if (!domainMap[d]) domainMap[d] = { covered: 0, partial: 0, missing: 0 };
    domainMap[d][gap.gapLevel]++;
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [domain, counts] of Object.entries(domainMap)) {
    const total = counts.covered + counts.partial + counts.missing;
    const score = total > 0 ? ((counts.covered + counts.partial * 0.5) / total) * 100 : 100;
    const w = DOMAIN_WEIGHTS[domain] ?? 0;
    weightedSum += score * w;
    totalWeight += w;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}

/**
 * Control effectiveness: blended score of questionnaire + domain coverage.
 * When either input is missing the other is weighted at 100%.
 */
export function computeControlEffectiveness(
  qScore: number | null,
  domainCoverage: number | null,
): number {
  if (qScore !== null && domainCoverage !== null) {
    return Math.round(qScore * 0.40 + domainCoverage * 0.60);
  }
  if (qScore !== null) return qScore;
  if (domainCoverage !== null) return domainCoverage;
  return 0;
}

/** Residual factor — fraction of inherent risk remaining after controls.  Floor: 0.15. */
export function computeResidualFactor(controlEffectiveness: number): number {
  return Math.max(0.15, 1 - controlEffectiveness / 100);
}

/** Final residual score (rounded to nearest integer). */
export function computeResidualScore(inherentScore: number, residualFactor: number): number {
  return Math.round(inherentScore * residualFactor);
}

/** Map a 0–100 score to a qualitative risk level. */
export function scoreToRisk(score: number): OverallRisk {
  if (score >= 65) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

// ── Composite result ───────────────────────────────────────────────────────────

export interface RiskMatrixResult {
  inherentScore:        number;
  domainCoverage:       number | null;  // null = no DORA gap data
  qScore:               number | null;  // null = no questionnaire
  controlEffectiveness: number;         // 0–100
  residualFactor:       number;         // 0–1 fraction remaining
  residualScore:        number;
  inherentRisk:         OverallRisk;
  residualRisk:         OverallRisk;
  hasData:              boolean;        // true if at least one control input is present
}

export function buildRiskMatrix(
  tier:      VendorTier | null | undefined,
  functions: VendorFunction[] | null | undefined,
  gaps:      Gap[] | null | undefined,
  qScore:    number | null,
): RiskMatrixResult {
  const inherentScore  = computeInherentScore(tier, functions);
  const domainCoverage = computeDomainCoverage(gaps);
  const controlEff     = computeControlEffectiveness(qScore, domainCoverage);
  const residualFactor = computeResidualFactor(controlEff);
  const residualScore  = computeResidualScore(inherentScore, residualFactor);

  return {
    inherentScore,
    domainCoverage,
    qScore,
    controlEffectiveness: controlEff,
    residualFactor,
    residualScore,
    inherentRisk:  scoreToRisk(inherentScore),
    residualRisk:  scoreToRisk(residualScore),
    hasData:       qScore !== null || domainCoverage !== null,
  };
}
