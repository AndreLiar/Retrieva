/**
 * Concentration & nth-party analysis (DORA Art 28(4) / 29) — RTV-15 Phase 1.
 *
 * Answers "if a provider or its sub-provider fails, which critical functions stop, and
 * where is the firm over-concentrated?" over the org's provider graph:
 *   CriticalFunction → Provider(=Workspace) → SubProvider (nth-party edges)
 *
 * The scoring is a PURE function (computeConcentration) so it's fully unit-testable
 * without a DB; analyzeOrganization is the thin data-loading wrapper.
 */

import logger from '../config/logger.js';

const CRITICALITY_WEIGHT = { critical: 2, important: 1 };
const MAX_DEPTH = 12; // cycle/blowup guard for chain traversal

const norm = (s) => String(s || '').trim().toLowerCase();
const wKey = (id) => `w:${String(id)}`;
const xKey = (name) => `x:${norm(name)}`;

/** Node key for an edge endpoint (workspace by id, else external by normalised name). */
function nodeKey(node) {
  if (node?.kind === 'workspace' && node.workspaceId) return wKey(node.workspaceId);
  return xKey(node?.name);
}

/**
 * Pure concentration computation.
 *
 * @param {object} g
 * @param {Array<{id:string,name:string,tier?:string}>} g.providers          assessed workspaces (provider nodes)
 * @param {Array<{id:string,name:string,criticality:'critical'|'important',dependsOn:string[]}>} g.criticalFunctions
 * @param {Array<{parent:object,child:object}>} g.edges                        confirmed nth-party edges
 * @returns {{ providerConcentration:Array, sharedSubstrate:Array, singlePointsOfFailure:Array, coverage:object }}
 */
export function computeConcentration({ providers = [], criticalFunctions = [], edges = [] } = {}) {
  // adjacency: nodeKey → Set(childKey)
  const adj = new Map();
  const displayName = new Map(); // key → human name
  for (const p of providers) {
    displayName.set(wKey(p.id), p.name);
  }
  for (const e of edges) {
    const pk = nodeKey(e.parent);
    const ck = nodeKey(e.child);
    if (!adj.has(pk)) adj.set(pk, new Set());
    adj.get(pk).add(ck);
    if (!displayName.has(pk)) displayName.set(pk, e.parent?.name || pk);
    if (!displayName.has(ck)) displayName.set(ck, e.child?.name || ck);
  }

  // reachable node set from a start key (includes itself), depth-capped, cycle-safe
  function reach(startKey) {
    const seen = new Set();
    const stack = [[startKey, 0]];
    while (stack.length) {
      const [k, d] = stack.pop();
      if (seen.has(k) || d > MAX_DEPTH) continue;
      seen.add(k);
      for (const c of adj.get(k) || []) stack.push([c, d + 1]);
    }
    return seen;
  }

  // per-CIF: the full set of nodes it ultimately depends on (direct providers + chain)
  const cifReach = new Map(); // cifId → Set(nodeKey)
  for (const cf of criticalFunctions) {
    const r = new Set();
    for (const pid of cf.dependsOn || []) {
      for (const k of reach(wKey(pid))) r.add(k);
    }
    cifReach.set(cf.id, r);
  }

  // per-node concentration: which CIFs depend on it (directly or transitively)
  const perNode = new Map(); // key → { key, name, weighted, cifs:[], reachedByProviders:Set }
  const ensure = (key) =>
    perNode.get(key) ||
    perNode.set(key, {
      key,
      name: displayName.get(key) || key,
      weighted: 0,
      cifs: [],
      reachedByProviders: new Set(),
    }).get(key);

  for (const cf of criticalFunctions) {
    const w = CRITICALITY_WEIGHT[cf.criticality] || 1;
    const directProviderKeys = (cf.dependsOn || []).map(wKey);
    for (const key of cifReach.get(cf.id) || []) {
      const rec = ensure(key);
      rec.weighted += w;
      rec.cifs.push({ id: cf.id, name: cf.name, criticality: cf.criticality });
      // which top-level providers of THIS cif reach this node → shared-substrate signal
      for (const dpk of directProviderKeys) {
        if (reach(dpk).has(key)) rec.reachedByProviders.add(dpk);
      }
    }
  }

  const providerKeys = new Set(providers.map((p) => wKey(p.id)));
  const nodes = [...perNode.values()].map((n) => ({
    key: n.key,
    name: n.name,
    isAssessedProvider: providerKeys.has(n.key),
    supportedFunctions: n.cifs.length,
    weightedScore: n.weighted,
    reachedByProviderCount: n.reachedByProviders.size,
  }));

  // provider concentration = assessed providers ranked by weighted supported CIFs
  const providerConcentration = nodes
    .filter((n) => n.isAssessedProvider)
    .sort((a, b) => b.weightedScore - a.weightedScore);

  // shared substrate = any node reached by ≥2 distinct top-level providers (the
  // "everything → Azure" Art 29 systemic signal); sub-providers surface here.
  const sharedSubstrate = nodes
    .filter((n) => n.reachedByProviderCount >= 2)
    .sort((a, b) => b.reachedByProviderCount - a.reachedByProviderCount);

  // SPOF = a critical/important function depending on a single provider (no alternative)
  const providerNameById = new Map(providers.map((p) => [String(p.id), p.name]));
  const singlePointsOfFailure = criticalFunctions
    .filter((cf) => (cf.dependsOn || []).length === 1)
    .map((cf) => ({
      functionId: cf.id,
      functionName: cf.name,
      criticality: cf.criticality,
      soleProvider: providerNameById.get(String(cf.dependsOn[0])) || String(cf.dependsOn[0]),
    }))
    .sort((a, b) => (CRITICALITY_WEIGHT[b.criticality] || 0) - (CRITICALITY_WEIGHT[a.criticality] || 0));

  // coverage: how much of the graph is actually mapped (honest scoring, no false confidence)
  const providersUsed = new Set();
  for (const cf of criticalFunctions) for (const pid of cf.dependsOn || []) providersUsed.add(String(pid));
  const coverage = {
    totalProviders: providers.length,
    providersMappedToFunctions: providersUsed.size,
    unmappedProviders: providers.filter((p) => !providersUsed.has(String(p.id))).map((p) => p.name),
    criticalFunctionCount: criticalFunctions.length,
    nthPartyEdges: edges.length,
  };

  return { providerConcentration, sharedSubstrate, singlePointsOfFailure, coverage };
}

/**
 * Load an organisation's graph and compute concentration. Thin DB wrapper — all logic
 * is in computeConcentration (pure). Injectable deps for testing.
 */
export async function analyzeOrganization(organizationId, deps = {}) {
  const { Workspace, CriticalFunction, ProviderDependency } = deps.models || (await loadModels());
  const [workspaces, cfs, edges] = await Promise.all([
    Workspace.find({ organizationId }).lean(),
    CriticalFunction.find({ organizationId }).lean(),
    ProviderDependency.find({ organizationId, confirmed: true }).lean(),
  ]);
  logger.info('Concentration analysis', {
    service: 'concentration', organizationId,
    providers: workspaces.length, criticalFunctions: cfs.length, edges: edges.length,
  });
  return computeConcentration({
    providers: workspaces.map((w) => ({ id: String(w._id), name: w.name, tier: w.vendorTier })),
    criticalFunctions: cfs.map((c) => ({
      id: String(c._id), name: c.name, criticality: c.criticality,
      dependsOn: (c.dependsOn || []).map(String),
    })),
    edges,
  });
}

async function loadModels() {
  const [{ Workspace }, { CriticalFunction }, { ProviderDependency }] = await Promise.all([
    import('../models/Workspace.js'),
    import('../models/CriticalFunction.js'),
    import('../models/ProviderDependency.js'),
  ]);
  return { Workspace, CriticalFunction, ProviderDependency };
}
