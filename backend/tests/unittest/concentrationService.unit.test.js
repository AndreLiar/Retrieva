/**
 * concentrationService (RTV-15 — DORA Art 28(4)/29 concentration + nth-party graph).
 * Pure scoring logic: transitive reach, weighted supported-functions, single points of
 * failure, shared-substrate detection, and coverage honesty.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { computeConcentration } = await import('../../services/concentrationService.js');

// Scenario: two functions, three providers, a shared Azure substrate.
//   Claims (critical)   → Azure, OpenAI
//   Payments (important)→ Azure
//   OpenAI → Azure-infra  (nth-party)   Azure → Azure-infra
const providers = [
  { id: 'az', name: 'Azure', tier: 'critical' },
  { id: 'oa', name: 'OpenAI', tier: 'important' },
  { id: 'sf', name: 'Salesforce', tier: 'standard' }, // unmapped to any function
];
const criticalFunctions = [
  { id: 'claims', name: 'Claims processing', criticality: 'critical', dependsOn: ['az', 'oa'] },
  { id: 'pay', name: 'Payments', criticality: 'important', dependsOn: ['az'] },
];
const edges = [
  { parent: { kind: 'workspace', workspaceId: 'oa', name: 'OpenAI' }, child: { kind: 'external', name: 'Azure-infra' } },
  { parent: { kind: 'workspace', workspaceId: 'az', name: 'Azure' }, child: { kind: 'external', name: 'Azure-infra' } },
];

describe('computeConcentration', () => {
  const r = computeConcentration({ providers, criticalFunctions, edges });

  it('ranks providers by weighted supported functions (critical=2, important=1)', () => {
    const azure = r.providerConcentration.find((p) => p.name === 'Azure');
    const openai = r.providerConcentration.find((p) => p.name === 'OpenAI');
    // Azure supports Claims(2) + Payments(1) = 3; OpenAI supports Claims(2) = 2
    expect(azure.weightedScore).toBe(3);
    expect(openai.weightedScore).toBe(2);
    expect(r.providerConcentration[0].name).toBe('Azure'); // top concentration
  });

  it('detects the shared substrate (Azure-infra reached by 2 distinct providers)', () => {
    const substrate = r.sharedSubstrate.find((n) => n.name === 'Azure-infra');
    expect(substrate).toBeTruthy();
    expect(substrate.reachedByProviderCount).toBeGreaterThanOrEqual(2); // Azure + OpenAI
  });

  it('flags single points of failure (Payments depends on Azure alone)', () => {
    const spof = r.singlePointsOfFailure.find((s) => s.functionName === 'Payments');
    expect(spof).toBeTruthy();
    expect(spof.soleProvider).toBe('Azure');
    // Claims has two providers → not a SPOF
    expect(r.singlePointsOfFailure.some((s) => s.functionName === 'Claims processing')).toBe(false);
  });

  it('reports coverage honestly (Salesforce is unmapped to any function)', () => {
    expect(r.coverage.totalProviders).toBe(3);
    expect(r.coverage.providersMappedToFunctions).toBe(2);
    expect(r.coverage.unmappedProviders).toContain('Salesforce');
    expect(r.coverage.criticalFunctionCount).toBe(2);
    expect(r.coverage.nthPartyEdges).toBe(2);
  });

  it('is cycle-safe (a provider graph with a loop does not hang)', () => {
    const looped = computeConcentration({
      providers: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      criticalFunctions: [{ id: 'f', name: 'F', criticality: 'critical', dependsOn: ['a'] }],
      edges: [
        { parent: { kind: 'workspace', workspaceId: 'a', name: 'A' }, child: { kind: 'workspace', workspaceId: 'b', name: 'B' } },
        { parent: { kind: 'workspace', workspaceId: 'b', name: 'B' }, child: { kind: 'workspace', workspaceId: 'a', name: 'A' } },
      ],
    });
    // A→B→A cycle: F reaches both A and B, terminates
    const names = looped.providerConcentration.map((p) => p.name).sort();
    expect(names).toEqual(['A', 'B']);
  });

  it('handles an empty org (no false confidence)', () => {
    const e = computeConcentration({});
    expect(e.providerConcentration).toEqual([]);
    expect(e.singlePointsOfFailure).toEqual([]);
    expect(e.coverage.totalProviders).toBe(0);
  });
});
