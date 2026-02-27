/**
 * Gap Analysis Agent — LangChain ReAct Loop
 *
 * Uses LangChain's createToolCallingAgent + AgentExecutor to run a proper
 * ReAct (Reason + Act) loop:
 *
 *  The agent autonomously decides:
 *   1. Which vendor document queries to run (search_vendor_documents tool)
 *   2. Which DORA domains to retrieve requirements for (search_dora_requirements tool)
 *   3. When it has enough evidence to call record_gap_analysis (final output tool)
 *
 * Falls back to a direct 3-step pipeline if the LLM does not support tool calling.
 */

import { z } from 'zod';
import { QdrantClient } from '@qdrant/js-client-rest';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { Assessment } from '../models/Assessment.js';
import { embeddings } from '../config/embeddings.js';
import { createLLM } from '../config/llmProvider.js';
import logger from '../config/logger.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
export const COMPLIANCE_KB_COLLECTION = 'compliance_kb';

const DORA_DOMAINS = [
  'General Provisions',
  'ICT Risk Management',
  'Incident Reporting',
  'Resilience Testing',
  'Third-Party Risk',
  'ICT Third-Party Oversight',
  'Information Sharing',
];

const CONTRACT_A30_DOMAINS = [
  'Service Description',
  'Data Governance',
  'Security and Resilience',
  'Business Continuity',
  'Subcontracting',
  'Audit and Inspection',
  'Termination and Exit',
  'Regulatory Compliance',
];

// 12 mandatory DORA Article 30 clauses injected into the system prompt
const CONTRACT_A30_CLAUSES = [
  {
    ref: 'Art.30(2)(a)',
    category: 'Service Description',
    text: 'Clear and complete description of all ICT services and functions to be provided',
  },
  {
    ref: 'Art.30(2)(b)',
    category: 'Data Governance',
    text: 'Locations (countries/regions) where data will be processed and stored',
  },
  {
    ref: 'Art.30(2)(c)',
    category: 'Security and Resilience',
    text: 'Provisions on availability, authenticity, integrity and confidentiality of data',
  },
  {
    ref: 'Art.30(2)(d)',
    category: 'Data Governance',
    text: 'Provisions for accessibility, return, recovery and secure deletion of data on exit',
  },
  {
    ref: 'Art.30(2)(e)',
    category: 'Subcontracting',
    text: 'Full description of all subcontractors and their data processing locations',
  },
  {
    ref: 'Art.30(2)(f)',
    category: 'Business Continuity',
    text: 'ICT service continuity conditions including service level objective amendments',
  },
  {
    ref: 'Art.30(2)(g)',
    category: 'Business Continuity',
    text: "Business continuity plan provisions relevant to the financial entity's services",
  },
  {
    ref: 'Art.30(2)(h)',
    category: 'Termination and Exit',
    text: 'Termination rights of the financial entity including adequate notice periods',
  },
  {
    ref: 'Art.30(3)(a)',
    category: 'Service Description',
    text: 'Full service level descriptions with quantitative and qualitative performance targets',
  },
  {
    ref: 'Art.30(3)(b)',
    category: 'Regulatory Compliance',
    text: 'Advance notification obligations for material changes to ICT services',
  },
  {
    ref: 'Art.30(3)(c)',
    category: 'Audit and Inspection',
    text: 'Right to carry out full audits and on-site inspections of the ICT provider',
  },
  {
    ref: 'Art.30(3)(d)',
    category: 'Security and Resilience',
    text: 'Obligation to assist the financial entity in ICT-related incident management and response',
  },
];

const CONTRACT_A30_SYSTEM_PROMPT = `You are a DORA Article 30 contract specialist reviewing ICT third-party contracts for financial entities.

You have two tools:
- search_contract_document: semantic search over the uploaded contract
- record_clause_review: record your final clause-by-clause review — call this ONCE when ready

Methodology:
1. Search the contract with 8–10 targeted queries covering each of the 12 mandatory clauses below.
2. For each clause, determine: covered / partial / missing.
3. Call record_clause_review with your complete structured findings.

Scoring:
- covered: Contract explicitly and clearly satisfies the obligation.
- partial: Clause is mentioned but incompletely or vaguely.
- missing: No relevant clause text found.

The 12 mandatory DORA Article 30 clauses to check:
${CONTRACT_A30_CLAUSES.map((c) => `${c.ref} [${c.category}]: ${c.text}`).join('\n')}`;

function getQdrantClient() {
  const opts = { url: QDRANT_URL };
  if (QDRANT_API_KEY) opts.apiKey = QDRANT_API_KEY;
  return new QdrantClient(opts);
}

// ---------------------------------------------------------------------------
// Zod schemas for LangChain structured tool inputs
// ---------------------------------------------------------------------------

const gapItemSchema = z.object({
  article: z.string().describe('DORA article reference, e.g. "Article 30(3)(e)"'),
  domain: z
    .enum([
      'General Provisions',
      'ICT Risk Management',
      'Incident Reporting',
      'Resilience Testing',
      'Third-Party Risk',
      'ICT Third-Party Oversight',
      'Information Sharing',
    ])
    .describe('The DORA compliance domain'),
  requirement: z.string().describe('The specific DORA obligation being assessed (1–2 sentences)'),
  vendorCoverage: z
    .string()
    .describe(
      'Quote or paraphrase from vendor documents showing coverage. Empty string if not addressed.'
    ),
  gapLevel: z
    .enum(['covered', 'partial', 'missing'])
    .describe(
      'covered = fully satisfies the obligation; partial = partially addresses it; missing = no evidence'
    ),
  recommendation: z
    .string()
    .describe('Actionable contractual or procedural remediation. Empty string if covered.'),
});

const recordGapAnalysisSchema = z.object({
  gaps: z
    .array(gapItemSchema)
    .describe(
      'Complete list of gap assessments — at least 15 entries spanning all DORA chapters (Articles 5–49)'
    ),
  overallRisk: z
    .enum(['High', 'Medium', 'Low'])
    .describe(
      'High = many missing obligations; Medium = several partial gaps; Low = mostly covered'
    ),
  summary: z
    .string()
    .describe('Executive summary (3–5 sentences) suitable for a compliance officer'),
  domainsAnalyzed: z.array(z.string()).describe('List of DORA domains covered in this analysis'),
});

// ---------------------------------------------------------------------------
// Agent system prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert EU DORA (Regulation 2022/2554) compliance analyst specialising in third-party ICT risk assessment for financial entities.

You have three tools available:
- search_vendor_documents: semantic search over the vendor's uploaded ICT documentation
- search_dora_requirements: retrieve DORA regulatory obligations per domain from the compliance knowledge base
- record_gap_analysis: record your final structured gap analysis — call this ONCE when ready

Follow this methodology:
1. Search vendor documents with 6–8 targeted queries covering: security policies, incident management, business continuity/DR, audit rights, data protection, SLAs, subcontracting, and vulnerability management.
2. Search DORA requirements for each of the seven domains: General Provisions, ICT Risk Management, Incident Reporting, Resilience Testing, Third-Party Risk, ICT Third-Party Oversight, and Information Sharing.
3. Reason about the evidence gathered and identify compliance gaps across all domains.
4. Call record_gap_analysis ONCE with your complete structured findings.

Scoring guidance:
- Mark as "covered" ONLY when vendor documentation explicitly and clearly addresses the obligation.
- Mark as "partial" when the vendor mentions the topic but incompletely or vaguely.
- Mark as "missing" when no relevant evidence was found.
- Focus especially on Articles 28–30 (third-party contractual requirements) and Articles 31–44 (ICT third-party oversight) — these are mandatory for all financial entity contracts with ICT providers.
- Produce at least 15 specific gap entries spanning all relevant domains.`;

// ---------------------------------------------------------------------------
// Build LangChain tools (closures capture assessmentId, client, embeddings)
// ---------------------------------------------------------------------------

function buildTools(assessmentId, client) {
  const collectionName = `assessment_${assessmentId}`;

  const searchVendorDocsTool = tool(
    async ({ query }) => {
      try {
        const queryVector = await embeddings.embedQuery(query);
        const results = await client.search(collectionName, {
          vector: queryVector,
          limit: 12,
          with_payload: true,
        });
        if (results.length === 0) {
          return 'No relevant content found in vendor documents for this query.';
        }
        return results
          .map((h, i) => {
            const content = h.payload?.pageContent || '';
            const file = h.payload?.metadata?.fileName || 'unknown';
            return `[${i + 1}] (${file}): ${content.slice(0, 500)}`;
          })
          .join('\n\n');
      } catch (err) {
        return `Search error: ${err.message}`;
      }
    },
    {
      name: 'search_vendor_documents',
      description:
        "Semantic search over the vendor's uploaded ICT documentation. Use targeted, domain-specific queries to find evidence of DORA compliance. Call multiple times with different queries.",
      schema: z.object({
        query: z.string().describe('Targeted search query about a specific DORA compliance area'),
      }),
    }
  );

  const searchDoraRequirementsTool = tool(
    async ({ domain }) => {
      try {
        const queryVector = await embeddings.embedQuery(
          `DORA obligations requirements ${domain} financial entity ICT third-party`
        );
        const results = await client.search(COMPLIANCE_KB_COLLECTION, {
          vector: queryVector,
          limit: 8,
          with_payload: true,
          filter: {
            must: [{ key: 'metadata.domain', match: { value: domain } }],
          },
        });
        if (results.length === 0) {
          return `No DORA articles found for domain: ${domain}`;
        }
        return results
          .map((h) => {
            const article = h.payload?.metadata?.article || '';
            const title = h.payload?.metadata?.title || '';
            const obligations = (h.payload?.metadata?.obligations || []).slice(0, 6).join('; ');
            return `${article} — ${title}\nKey obligations: ${obligations}`;
          })
          .join('\n\n');
      } catch (err) {
        return `Search error: ${err.message}`;
      }
    },
    {
      name: 'search_dora_requirements',
      description:
        'Retrieve DORA regulatory article obligations for a specific domain from the compliance knowledge base. Call once per domain.',
      schema: z.object({
        domain: z
          .enum([
            'General Provisions',
            'ICT Risk Management',
            'Incident Reporting',
            'Resilience Testing',
            'Third-Party Risk',
            'ICT Third-Party Oversight',
            'Information Sharing',
          ])
          .describe('The DORA domain to retrieve requirements for'),
      }),
    }
  );

  // Captures the structured result via closure — becomes the agent's final action
  let capturedResult = null;

  const recordGapAnalysisTool = tool(
    async (input) => {
      capturedResult = input;
      return 'Gap analysis recorded successfully. Task complete.';
    },
    {
      name: 'record_gap_analysis',
      description:
        'Call this ONCE when you have gathered sufficient evidence and are ready to submit the complete structured DORA gap analysis. This is your final action.',
      schema: recordGapAnalysisSchema,
    }
  );

  return {
    tools: [searchVendorDocsTool, searchDoraRequirementsTool, recordGapAnalysisTool],
    getResult: () => capturedResult,
  };
}

// ---------------------------------------------------------------------------
// CONTRACT_A30: Zod schema + tools + agent
// ---------------------------------------------------------------------------

const contractClauseItemSchema = z.object({
  article: z.string().describe('Article reference, e.g. "Art.30(2)(a)"'),
  domain: z
    .enum([
      'Service Description',
      'Data Governance',
      'Security and Resilience',
      'Business Continuity',
      'Subcontracting',
      'Audit and Inspection',
      'Termination and Exit',
      'Regulatory Compliance',
    ])
    .describe('The Article 30 clause category'),
  requirement: z
    .string()
    .describe('The specific Article 30 obligation being assessed (1–2 sentences)'),
  vendorCoverage: z
    .string()
    .describe(
      'Quote or paraphrase from the contract showing coverage. Empty string if not addressed.'
    ),
  gapLevel: z
    .enum(['covered', 'partial', 'missing'])
    .describe(
      'covered = contract explicitly satisfies the obligation; partial = partially addresses it; missing = no evidence'
    ),
  recommendation: z
    .string()
    .describe('Actionable renegotiation or drafting recommendation. Empty string if covered.'),
});

const recordClauseReviewSchema = z.object({
  gaps: z
    .array(contractClauseItemSchema)
    .describe('Complete list of clause reviews — one entry per Article 30 clause (12 total)'),
  overallRisk: z
    .enum(['High', 'Medium', 'Low'])
    .describe(
      'High = multiple missing clauses; Medium = several partial clauses; Low = contract broadly satisfies Article 30'
    ),
  summary: z
    .string()
    .describe(
      'Executive summary (3–5 sentences) suitable for a compliance officer or legal counsel'
    ),
  domainsAnalyzed: z
    .array(z.string())
    .describe('List of Article 30 clause categories covered in this review'),
});

function buildContractA30Tools(assessmentId, client) {
  const collectionName = `assessment_${assessmentId}`;

  const searchContractDocumentTool = tool(
    async ({ query }) => {
      try {
        const queryVector = await embeddings.embedQuery(query);
        const results = await client.search(collectionName, {
          vector: queryVector,
          limit: 12,
          with_payload: true,
        });
        if (results.length === 0) {
          return 'No relevant content found in the contract for this query.';
        }
        return results
          .map((h, i) => {
            const content = h.payload?.pageContent || '';
            const file = h.payload?.metadata?.fileName || 'unknown';
            return `[${i + 1}] (${file}): ${content.slice(0, 500)}`;
          })
          .join('\n\n');
      } catch (err) {
        return `Search error: ${err.message}`;
      }
    },
    {
      name: 'search_contract_document',
      description:
        'Semantic search over the uploaded ICT contract. Use targeted queries to find clause text relevant to each Article 30 obligation. Call multiple times with different queries.',
      schema: z.object({
        query: z.string().describe('Targeted search query about a specific Article 30 clause'),
      }),
    }
  );

  let capturedResult = null;

  const recordClauseReviewTool = tool(
    async (input) => {
      capturedResult = input;
      return 'Clause review recorded successfully. Task complete.';
    },
    {
      name: 'record_clause_review',
      description:
        'Call this ONCE when you have searched the contract thoroughly and are ready to submit the complete structured Article 30 clause review.',
      schema: recordClauseReviewSchema,
    }
  );

  return {
    tools: [searchContractDocumentTool, recordClauseReviewTool],
    getResult: () => capturedResult,
  };
}

async function runContractA30ReActAgent(assessment, emit) {
  const client = getQdrantClient();
  const { tools, getResult } = buildContractA30Tools(assessment._id.toString(), client);

  const llm = await createLLM({ temperature: 0, maxTokens: 4096 });

  emit('Building Article 30 contract review agent…', 15);

  const agent = createReactAgent({
    llm,
    tools,
    stateModifier: new SystemMessage(CONTRACT_A30_SYSTEM_PROMPT),
  });

  emit('Agent reviewing contract against Article 30 clauses…', 25);

  const userMessage = `Review the uploaded ICT contract for vendor '${assessment.vendorName}' against all 12 mandatory DORA Article 30 clauses. Search the contract thoroughly, then call record_clause_review with a complete clause-by-clause structured review covering all 12 obligations.`;

  try {
    await agent.invoke({ messages: [new HumanMessage(userMessage)] }, { recursionLimit: 40 });
  } catch (err) {
    if (!getResult()) {
      throw err;
    }
    logger.warn('Contract A30 agent hit recursion limit but result was captured', {
      service: 'gap-analysis',
      error: err.message,
    });
  }

  const result = getResult();
  if (!result) {
    throw new Error('Contract A30 agent did not call record_clause_review — no result produced');
  }

  logger.info('Contract A30 ReAct agent completed', {
    service: 'gap-analysis',
    assessmentId: assessment._id,
    clauseCount: result.gaps?.length ?? 0,
  });

  return result;
}

async function runContractA30FallbackPipeline(assessment, emit) {
  const client = getQdrantClient();
  const collectionName = `assessment_${assessment._id}`;

  emit('Extracting contract clauses (fallback pipeline)…', 15);

  // Step 1: search contract with clause-focused queries
  const queryPrompts = [
    'exit plan termination rights notice period',
    'audit rights on-site inspection access',
    'service level agreement SLA performance targets quantitative',
    'data portability return deletion exit',
    'subcontracting subprocessors third party locations',
    'termination exit transition assistance',
    'incident management response assistance notification',
    'material changes advance notification ICT services',
    'data location processing storage countries regions',
    'service description ICT functions scope',
  ];
  const allChunks = new Map();
  for (const query of queryPrompts) {
    const qv = await embeddings.embedQuery(query);
    const hits = await client.search(collectionName, {
      vector: qv,
      limit: 20,
      with_payload: true,
    });
    for (const h of hits) {
      const content = h.payload?.pageContent || '';
      if (content.length > 50 && !allChunks.has(content)) {
        allChunks.set(content, {
          content,
          fileName: h.payload?.metadata?.fileName || 'unknown',
          score: h.score,
        });
      }
    }
  }
  const contractChunks = [...allChunks.values()].sort((a, b) => b.score - a.score);

  emit('Analysing Article 30 clause gaps (fallback pipeline)…', 55);

  const llm = await createLLM({ temperature: 0, maxTokens: 4096 });

  const contractContext = contractChunks
    .slice(0, 40)
    .map((c, i) => `[C${i + 1}] ${c.content.slice(0, 300)}`)
    .join('\n\n');

  const clauseList = CONTRACT_A30_CLAUSES.map((c) => `${c.ref} [${c.category}]: ${c.text}`).join(
    '\n'
  );

  const systemPrompt = `You are a DORA Article 30 contract specialist. Review the provided contract excerpts against the 12 mandatory Article 30 clauses.

Respond ONLY with a valid JSON object:
{
  "gaps": [{"article":"...","domain":"...","requirement":"...","vendorCoverage":"...","gapLevel":"covered|partial|missing","recommendation":"..."}],
  "overallRisk": "High|Medium|Low",
  "summary": "...",
  "domainsAnalyzed": ["..."]
}`;

  const userPrompt = `Vendor: ${assessment.vendorName}

MANDATORY DORA ARTICLE 30 CLAUSES:
${clauseList}

CONTRACT EXCERPTS:
${contractContext}

Produce a clause-by-clause review covering all 12 Article 30 obligations.`;

  const response = await llm.invoke([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const content =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Contract A30 fallback LLM did not return valid JSON');

  return JSON.parse(jsonMatch[0]);
}

// ---------------------------------------------------------------------------
// LangChain / LangGraph ReAct Agent runner
// ---------------------------------------------------------------------------

async function runReActAgent(assessment, emit) {
  const client = getQdrantClient();
  const { tools, getResult } = buildTools(assessment._id.toString(), client);

  // Temperature 0 for deterministic compliance analysis
  const llm = await createLLM({ temperature: 0, maxTokens: 4096 });

  emit('Building LangChain ReAct agent…', 15);

  // createReactAgent from @langchain/langgraph/prebuilt — the canonical
  // LangChain v1.x ReAct loop using tool calling under the hood
  const agent = createReactAgent({
    llm,
    tools,
    // Inject system prompt via stateModifier
    stateModifier: new SystemMessage(SYSTEM_PROMPT),
    // Cap iterations to avoid runaway loops
    // (each iteration = one LLM call + optional tool calls)
  });

  emit('Agent searching vendor documents and DORA requirements…', 25);

  const userMessage = `Conduct a full DORA (Regulation EU 2022/2554) compliance gap analysis for the third-party ICT vendor: "${assessment.vendorName}".

Search vendor documents thoroughly, retrieve DORA requirements for all seven domains (General Provisions, ICT Risk Management, Incident Reporting, Resilience Testing, Third-Party Risk, ICT Third-Party Oversight, Information Sharing), then call record_gap_analysis with your complete structured findings covering all applicable chapters.`;

  try {
    await agent.invoke(
      { messages: [new HumanMessage(userMessage)] },
      { recursionLimit: 40 } // max graph steps (each tool call = 2 steps: invoke + result)
    );
  } catch (err) {
    // Recursion limit hit but result may already be captured
    if (!getResult()) {
      throw err;
    }
    logger.warn('Agent hit recursion limit but result was captured', {
      service: 'gap-analysis',
      error: err.message,
    });
  }

  const result = getResult();
  if (!result) {
    throw new Error('LangChain ReAct agent did not call record_gap_analysis — no result produced');
  }

  logger.info('LangChain ReAct agent completed', {
    service: 'gap-analysis',
    assessmentId: assessment._id,
    gapCount: result.gaps?.length ?? 0,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Fallback: direct 3-step pipeline (for LLMs without tool-calling support)
// ---------------------------------------------------------------------------

async function runFallbackPipeline(assessment, emit) {
  const client = getQdrantClient();
  const collectionName = `assessment_${assessment._id}`;

  emit('Extracting vendor claims (fallback pipeline)…', 15);

  // Step 1: extract vendor content
  const queryPrompts = [
    'security controls information security policies implemented by the vendor',
    'incident management notification procedures response time commitments',
    'business continuity disaster recovery RTO RPO backup procedures',
    'audit rights access rights inspection subcontracting provisions',
    'data protection confidentiality encryption access management',
    'service level agreements SLA availability uptime commitments',
    'third party subcontractors supply chain security',
    'vulnerability management patch management penetration testing',
  ];
  const allChunks = new Map();
  for (const query of queryPrompts) {
    const qv = await embeddings.embedQuery(query);
    const hits = await client.search(collectionName, {
      vector: qv,
      limit: 20,
      with_payload: true,
    });
    for (const h of hits) {
      const content = h.payload?.pageContent || '';
      if (content.length > 50 && !allChunks.has(content)) {
        allChunks.set(content, {
          content,
          fileName: h.payload?.metadata?.fileName || 'unknown',
          score: h.score,
        });
      }
    }
  }
  const vendorChunks = [...allChunks.values()].sort((a, b) => b.score - a.score);

  emit('Retrieving DORA obligations (fallback pipeline)…', 35);

  // Step 2: retrieve DORA obligations
  const domainArticles = {};
  for (const domain of DORA_DOMAINS) {
    const qv = await embeddings.embedQuery(
      `DORA obligations requirements ${domain} financial entity ICT third-party`
    );
    const hits = await client.search(COMPLIANCE_KB_COLLECTION, {
      vector: qv,
      limit: 8,
      with_payload: true,
      filter: { must: [{ key: 'metadata.domain', match: { value: domain } }] },
    });
    domainArticles[domain] = hits.map((h) => ({
      article: h.payload?.metadata?.article || '',
      title: h.payload?.metadata?.title || '',
      obligations: h.payload?.metadata?.obligations || [],
      text: h.payload?.metadata?.fullText || h.payload?.pageContent || '',
    }));
  }

  emit('Analysing gaps (fallback pipeline)…', 55);

  // Step 3: direct LLM call with JSON output
  const llm = await createLLM({ temperature: 0, maxTokens: 4096 });

  const vendorContext = vendorChunks
    .slice(0, 40)
    .map((c, i) => `[V${i + 1}] ${c.content.slice(0, 300)}`)
    .join('\n\n');

  const doraContext = Object.entries(domainArticles)
    .map(([domain, articles]) => {
      const lines = articles
        .map((a) => `${a.article} (${a.title}): ${a.obligations.slice(0, 5).join('; ')}`)
        .join('\n');
      return `=== ${domain} ===\n${lines}`;
    })
    .join('\n\n');

  const systemPrompt = `You are an EU DORA compliance expert. Perform a gap analysis comparing vendor documentation against DORA obligations.

Respond ONLY with a valid JSON object:
{
  "gaps": [{"article":"...","domain":"...","requirement":"...","vendorCoverage":"...","gapLevel":"covered|partial|missing","recommendation":"..."}],
  "overallRisk": "High|Medium|Low",
  "summary": "...",
  "domainsAnalyzed": ["..."]
}`;

  const userPrompt = `Vendor: ${assessment.vendorName}\n\nDORA OBLIGATIONS:\n${doraContext}\n\nVENDOR EVIDENCE:\n${vendorContext}\n\nProduce a gap analysis with at least 15 gaps spanning all DORA chapters (Articles 5–49).`;

  const response = await llm.invoke([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const content =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Fallback LLM did not return valid JSON');

  return JSON.parse(jsonMatch[0]);
}

// ---------------------------------------------------------------------------
// Main entry point called by the BullMQ worker
// ---------------------------------------------------------------------------

export async function runGapAnalysis({ assessmentId, userId, job }) {
  logger.info('Gap analysis started', { service: 'gap-analysis', assessmentId });

  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);

  const emit = (msg, pct) => {
    if (job && pct !== undefined) job.updateProgress(pct).catch(() => {});
    logger.debug('Gap analysis progress', { assessmentId, msg, pct });
  };

  // Wait for all documents to finish indexing (max 2 min)
  const hasUnindexed = assessment.documents.some((d) => d.status === 'uploading');
  if (hasUnindexed) {
    let attempts = 0;
    while (attempts < 12) {
      await new Promise((r) => setTimeout(r, 10000));
      const fresh = await Assessment.findById(assessmentId);
      if (fresh.documents.every((d) => d.status !== 'uploading')) break;
      attempts++;
    }
    const finalCheck = await Assessment.findById(assessmentId);
    if (finalCheck.documents.every((d) => d.status === 'failed')) {
      throw new Error('All document indexing jobs failed — cannot run gap analysis');
    }
  }

  // Branch on framework: CONTRACT_A30 uses its own agent/fallback
  let result;
  if (assessment.framework === 'CONTRACT_A30') {
    try {
      result = await runContractA30ReActAgent(assessment, emit);
      logger.info('Gap analysis used Contract A30 ReAct agent', {
        service: 'gap-analysis',
        assessmentId,
      });
    } catch (agentErr) {
      logger.warn('Contract A30 agent failed, using fallback', {
        service: 'gap-analysis',
        assessmentId,
        error: agentErr.message,
      });
      result = await runContractA30FallbackPipeline(assessment, emit);
    }
  } else {
    try {
      result = await runReActAgent(assessment, emit);
      logger.info('Gap analysis used LangChain ReAct agent', {
        service: 'gap-analysis',
        assessmentId,
      });
    } catch (agentErr) {
      logger.warn('LangChain agent failed, using fallback pipeline', {
        service: 'gap-analysis',
        assessmentId,
        error: agentErr.message,
      });
      result = await runFallbackPipeline(assessment, emit);
    }
  }

  emit('Finalising results…', 90);

  const VALID_DOMAINS =
    assessment.framework === 'CONTRACT_A30' ? CONTRACT_A30_DOMAINS : DORA_DOMAINS;
  const DEFAULT_DOMAIN =
    assessment.framework === 'CONTRACT_A30' ? 'Service Description' : 'Third-Party Risk';
  const FALLBACK_DOMAINS =
    assessment.framework === 'CONTRACT_A30' ? CONTRACT_A30_DOMAINS : DORA_DOMAINS;

  // Validate and normalise
  const gaps = (result.gaps || []).map((g) => ({
    article: g.article || 'Unknown',
    domain: VALID_DOMAINS.includes(g.domain) ? g.domain : DEFAULT_DOMAIN,
    requirement: g.requirement || '',
    vendorCoverage: g.vendorCoverage || '',
    gapLevel: ['covered', 'partial', 'missing'].includes(g.gapLevel) ? g.gapLevel : 'missing',
    recommendation: g.recommendation || '',
    sourceChunks: [],
  }));

  const overallRisk = ['High', 'Medium', 'Low'].includes(result.overallRisk)
    ? result.overallRisk
    : 'High';

  await Assessment.findByIdAndUpdate(assessmentId, {
    status: 'complete',
    statusMessage: 'Analysis complete',
    'results.gaps': gaps,
    'results.overallRisk': overallRisk,
    'results.summary': result.summary || '',
    'results.domainsAnalyzed': result.domainsAnalyzed || FALLBACK_DOMAINS,
    'results.generatedAt': new Date(),
  });

  logger.info('Gap analysis complete', {
    service: 'gap-analysis',
    assessmentId,
    gapCount: gaps.length,
    overallRisk,
  });

  return { gapCount: gaps.length, overallRisk };
}
