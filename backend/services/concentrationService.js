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

/**
 * Build a viz-ready node/edge graph for the org (P3 frontend contract). Nodes carry
 * the concentration score so the UI can size/colour them; edges include CIF→provider
 * dependencies + provider→sub-provider nth-party links.
 */
export async function getGraph(organizationId, deps = {}) {
  const { Workspace, CriticalFunction, ProviderDependency } = deps.models || (await loadModels());
  const [workspaces, cfs, edges] = await Promise.all([
    Workspace.find({ organizationId }).lean(),
    CriticalFunction.find({ organizationId }).lean(),
    ProviderDependency.find({ organizationId }).lean(),
  ]);
  const analysis = computeConcentration({
    providers: workspaces.map((w) => ({ id: String(w._id), name: w.name, tier: w.vendorTier })),
    criticalFunctions: cfs.map((c) => ({
      id: String(c._id), name: c.name, criticality: c.criticality, dependsOn: (c.dependsOn || []).map(String),
    })),
    edges: edges.filter((e) => e.confirmed),
  });
  const scoreByWs = Object.fromEntries(
    (analysis.providerConcentration || []).map((p) => [p.key.replace(/^w:/, ''), p.weightedScore])
  );

  const nodes = [
    ...cfs.map((c) => ({
      id: `cf:${c._id}`, type: 'function', label: c.name, criticality: c.criticality,
    })),
    ...workspaces.map((w) => ({
      id: `w:${w._id}`, type: 'provider', label: w.name, tier: w.vendorTier || null,
      concentrationScore: scoreByWs[String(w._id)] || 0,
    })),
  ];
  const graphEdges = [];
  for (const c of cfs) for (const pid of c.dependsOn || []) {
    graphEdges.push({ from: `cf:${c._id}`, to: `w:${pid}`, kind: 'depends_on' });
  }
  for (const e of edges) {
    const from = e.parent?.kind === 'workspace' && e.parent.workspaceId ? `w:${e.parent.workspaceId}` : `x:${norm(e.parent?.name)}`;
    const to = e.child?.kind === 'workspace' && e.child.workspaceId ? `w:${e.child.workspaceId}` : `x:${norm(e.child?.name)}`;
    if (e.child?.kind === 'external') nodes.push({ id: to, type: 'subprovider', label: e.child.name });
    graphEdges.push({ from, to, kind: 'sub_processes_via', source: e.source, confirmed: e.confirmed });
  }
  // dedup external subprovider nodes
  const seen = new Set();
  const uniqueNodes = nodes.filter((n) => (seen.has(n.id) ? false : seen.add(n.id)));
  return { nodes: uniqueNodes, edges: graphEdges, summary: analysis };
}

// ── Critical Function CRUD (firm-owned governance) ───────────────────────────

export async function listCriticalFunctions(organizationId, deps = {}) {
  const { CriticalFunction } = deps.models || (await loadModels());
  return CriticalFunction.find({ organizationId }).sort({ criticality: 1, name: 1 }).lean();
}

export async function upsertCriticalFunction(organizationId, { id, name, criticality, description, dependsOn, userId }, deps = {}) {
  const { CriticalFunction } = deps.models || (await loadModels());
  const doc = { organizationId, name, criticality, description: description || '', dependsOn: dependsOn || [] };
  if (id) {
    return CriticalFunction.findOneAndUpdate({ _id: id, organizationId }, doc, { new: true }).lean();
  }
  return (await CriticalFunction.create({ ...doc, createdBy: userId || '' })).toObject();
}

export async function deleteCriticalFunction(organizationId, id, deps = {}) {
  const { CriticalFunction } = deps.models || (await loadModels());
  return CriticalFunction.findOneAndDelete({ _id: id, organizationId }).lean();
}

// ── nth-party dependency edges ───────────────────────────────────────────────

export async function listDependencies(organizationId, deps = {}) {
  const { ProviderDependency } = deps.models || (await loadModels());
  return ProviderDependency.find({ organizationId }).sort({ confirmed: 1, createdAt: -1 }).lean();
}

/** Confirm (or reject) an AI-extracted edge — the human-in-the-loop gate. */
export async function setDependencyConfirmed(organizationId, id, confirmed, deps = {}) {
  const { ProviderDependency } = deps.models || (await loadModels());
  if (confirmed === false) {
    return ProviderDependency.findOneAndDelete({ _id: id, organizationId }).lean();
  }
  return ProviderDependency.findOneAndUpdate(
    { _id: id, organizationId },
    { confirmed: true, lastVerifiedAt: new Date() },
    { new: true }
  ).lean();
}

// ── Sub-provider auto-extraction (P2) ────────────────────────────────────────

const SUBPROVIDER_EXTRACT_PROMPT = `You are extracting the SUBPROCESSOR / sub-provider list from an ICT vendor's documentation (SOC 2, DPA, subprocessor page). List ONLY named third-party companies the vendor itself relies on to deliver its service (e.g. cloud/infra providers, sub-CSPs). Exclude the vendor itself, the customer, generic terms, and product names. Return STRICT JSON: {"subproviders":[{"name":"...","service":"..."}]} — service is a short role (e.g. "cloud infrastructure"), or "" if unknown. If none found, return {"subproviders":[]}.`;

/**
 * Pure parse of the LLM's extraction output into clean, deduped edge candidates.
 * Drops self-references (a vendor listing itself) and empties. Exported for testing.
 *
 * @param {string} raw            LLM response text (expected JSON)
 * @param {string} parentName     the vendor being extracted (self-reference filter)
 * @returns {Array<{name:string, service:string}>}
 */
export function parseSubproviderExtraction(raw, parentName = '') {
  let obj;
  try {
    const m = String(raw).match(/\{[\s\S]*\}/); // tolerate prose around the JSON
    obj = JSON.parse(m ? m[0] : raw);
  } catch {
    return [];
  }
  const list = Array.isArray(obj?.subproviders) ? obj.subproviders : [];
  const pn = norm(parentName);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const name = typeof item === 'string' ? item : item?.name;
    const clean = String(name || '').trim();
    if (!clean) continue;
    const key = norm(clean);
    if (key === pn || seen.has(key)) continue; // no self-ref, no dups
    seen.add(key);
    out.push({ name: clean, service: (typeof item === 'object' && item?.service) ? String(item.service).trim() : '' });
  }
  return out;
}

/**
 * Extract sub-provider edges for one workspace from its vendor docs and persist them
 * as UNCONFIRMED extracted edges (human confirms before they affect scoring). Reuses
 * the existing per-assessment vector search + a governed LLM. Best-effort.
 *
 * @returns {Promise<{ created:number, candidates:Array }>}
 */
export async function extractSubProvidersForWorkspace(organizationId, workspaceId, deps = {}) {
  const models = deps.models || (await loadModels());
  const { Workspace, ProviderDependency } = models;
  const ws = await Workspace.findOne({ _id: workspaceId, organizationId }).lean();
  if (!ws) throw Object.assign(new Error('Workspace not found'), { statusCode: 404 });

  const search = deps.searchVendorDocs || (await defaultSearch(workspaceId));
  const llm = deps.llm || (await defaultLLM());

  const chunks = await search('subprocessors subcontractors third-party providers cloud infrastructure data processing locations');
  if (!chunks || !chunks.length) return { created: 0, candidates: [] };
  const context = chunks.slice(0, 12).map((c, i) => `[${i + 1}] ${c}`).join('\n\n');

  let raw = '';
  try {
    const res = await llm.invoke([
      { role: 'system', content: SUBPROVIDER_EXTRACT_PROMPT },
      { role: 'user', content: `Vendor: ${ws.name}\n\nDocumentation excerpts:\n${context}` },
    ]);
    raw = typeof res === 'string' ? res : res?.content || '';
  } catch (e) {
    logger.warn('Sub-provider extraction LLM call failed', { service: 'concentration', workspaceId, error: e.message });
    return { created: 0, candidates: [] };
  }

  const candidates = parseSubproviderExtraction(raw, ws.name);
  let created = 0;
  for (const c of candidates) {
    // idempotent: skip if an edge parent(ws)→child(name) already exists
    const exists = await ProviderDependency.findOne({
      organizationId, 'parent.workspaceId': workspaceId, 'child.name': c.name,
    }).lean();
    if (exists) continue;
    await ProviderDependency.create({
      organizationId,
      parent: { kind: 'workspace', workspaceId, name: ws.name, tier: ws.vendorTier || null },
      child: { kind: 'external', name: c.name, tier: null },
      relationship: c.service || 'sub_processes_via',
      source: 'extracted',
      confidence: 0.7,
      confirmed: false, // human must confirm before it affects concentration scoring
    });
    created += 1;
  }
  logger.info('Sub-provider extraction complete', {
    service: 'concentration', workspaceId, candidates: candidates.length, created,
  });
  return { created, candidates };
}

async function defaultSearch(workspaceId) {
  // Find the latest complete assessment for the workspace + reuse its chunk search.
  const [{ Assessment }, ingest] = await Promise.all([
    import('../models/Assessment.js'),
    import('./fileIngestionService.js'),
  ]);
  const a = await Assessment.findOne({ workspaceId, status: 'complete' }).sort({ createdAt: -1 }).lean();
  if (!a) return async () => [];
  return async (q) => {
    const hits = await ingest.searchAssessmentChunks(String(a._id), q, 15);
    return hits.map((h) => h.content);
  };
}

async function defaultLLM() {
  const { createLLM } = await import('../config/llmProvider.js');
  return createLLM({ purpose: 'analysis' });
}
