/**
 * Agentic RAG Retriever
 *
 * A LangGraph ReAct agent that autonomously decides:
 *   1. What queries to run against the workspace knowledge base
 *   2. Whether to cross-reference DORA compliance articles
 *   3. Whether to pull existing vendor assessment summaries
 *   4. When sufficient context has been gathered
 *
 * Returns accumulated LangChain Document objects that flow into the existing
 * rerankDocuments → _prepareContext → _generateAnswer pipeline in rag.js.
 *
 * Three tools are available to the agent:
 *   - search_knowledge_base    : vector search over workspace docs (Qdrant)
 *   - search_dora_articles     : search DORA regulation KB (Qdrant compliance_kb)
 *   - lookup_vendor_assessment : retrieve a completed DORA gap analysis (MongoDB)
 *   - done_searching           : signals the agent is ready to synthesize
 */

import { z } from 'zod';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { QdrantClient } from '@qdrant/js-client-rest';
import { embeddings } from '../config/embeddings.js';
import { COMPLIANCE_KB_COLLECTION } from './gapAnalysisAgent.js';
import logger from '../config/logger.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

function getQdrantClient() {
  const opts = { url: QDRANT_URL };
  if (QDRANT_API_KEY) opts.apiKey = QDRANT_API_KEY;
  return new QdrantClient(opts);
}

// ---------------------------------------------------------------------------
// Agent system prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a DORA compliance intelligence assistant for financial entities.
Your task is to gather relevant information to answer a user's question accurately.

You have four tools:
- search_knowledge_base: Search the workspace document library (internal policies, vendor contracts, procedures, uploaded files)
- search_dora_articles: Search DORA (EU Regulation 2022/2554) compliance articles and obligations
- lookup_vendor_assessment: Retrieve a completed DORA gap analysis for a specific ICT vendor
- done_searching: Call when you have gathered sufficient context to answer the question

Retrieval strategy:
1. Always start with search_knowledge_base using 2-3 targeted queries with varied wording.
2. If the question involves regulation, obligations, legal requirements, or specific DORA articles → also call search_dora_articles.
3. If the question asks about a specific vendor's compliance status or risk level → also call lookup_vendor_assessment.
4. Call done_searching once you have relevant, diverse context (or after 4-5 total tool calls).

Keep queries short and targeted. Do not repeat identical queries.`;

// ---------------------------------------------------------------------------
// Tool builder — closures capture shared state (collectedDocuments, seenContent)
// ---------------------------------------------------------------------------

function buildRetrievalTools(vectorStore, workspaceId, qdrantFilter, emit) {
  const client = getQdrantClient();
  const collectedDocuments = [];
  const seenContent = new Set();

  function addDoc(doc) {
    const key = doc.pageContent?.slice(0, 200);
    if (key && key.trim().length > 20 && !seenContent.has(key)) {
      seenContent.add(key);
      collectedDocuments.push(doc);
    }
  }

  // ── Tool 1: Search workspace knowledge base ──────────────────────────────
  const searchKnowledgeBaseTool = tool(
    async ({ query, k = 10 }) => {
      try {
        emit?.('status', { message: `Searching documents...` });
        const capped = Math.min(k, 15);
        const docs = await vectorStore.similaritySearch(query, capped, qdrantFilter);
        docs.forEach((doc) => addDoc(doc));

        if (docs.length === 0) return 'No documents found for this query.';
        return docs
          .map((d, i) => {
            const title = d.metadata?.documentTitle || d.metadata?.title || 'Untitled';
            return `[${i + 1}] (${title}): ${d.pageContent.slice(0, 500)}`;
          })
          .join('\n\n');
      } catch (err) {
        logger.warn('search_knowledge_base tool error', {
          service: 'rag-agent',
          error: err.message,
        });
        return `Search error: ${err.message}`;
      }
    },
    {
      name: 'search_knowledge_base',
      description:
        'Semantic search over the workspace document library. Use targeted queries to find relevant documents, policies, contracts, and procedures.',
      schema: z.object({
        query: z.string().describe('Targeted search query to find relevant documents'),
        k: z.number().optional().describe('Number of results to retrieve (default 10, max 15)'),
      }),
    }
  );

  // ── Tool 2: Search DORA compliance articles ──────────────────────────────
  const searchDoraArticlesTool = tool(
    async ({ query, domain }) => {
      try {
        emit?.('status', { message: 'Searching DORA requirements...' });
        const queryVector = await embeddings.embedQuery(query);
        const searchParams = { vector: queryVector, limit: 8, with_payload: true };
        if (domain) {
          searchParams.filter = {
            must: [{ key: 'metadata.domain', match: { value: domain } }],
          };
        }
        const results = await client.search(COMPLIANCE_KB_COLLECTION, searchParams);
        if (results.length === 0) return 'No DORA articles found for this query.';

        for (const r of results) {
          const content = r.payload?.pageContent || r.payload?.metadata?.fullText || '';
          if (content) {
            addDoc({
              pageContent: content,
              metadata: {
                ...r.payload?.metadata,
                sourceType: 'dora_regulation',
                documentTitle: `DORA — ${r.payload?.metadata?.article || 'Article'}`,
              },
            });
          }
        }

        return results
          .map((r) => {
            const article = r.payload?.metadata?.article || '';
            const title = r.payload?.metadata?.title || '';
            const obligations = (r.payload?.metadata?.obligations || []).slice(0, 5).join('; ');
            return `${article} — ${title}\nKey obligations: ${obligations}`;
          })
          .join('\n\n');
      } catch (err) {
        logger.warn('search_dora_articles tool error', {
          service: 'rag-agent',
          error: err.message,
        });
        return `DORA search error: ${err.message}`;
      }
    },
    {
      name: 'search_dora_articles',
      description:
        'Search DORA (EU Regulation 2022/2554) compliance articles and obligations. Use for questions about regulatory requirements, compliance obligations, or specific articles.',
      schema: z.object({
        query: z.string().describe('Query about DORA compliance requirements or obligations'),
        domain: z
          .enum([
            'ICT Risk Management',
            'Incident Reporting',
            'Resilience Testing',
            'Third-Party Risk',
          ])
          .optional()
          .describe('Optional: filter by DORA domain'),
      }),
    }
  );

  // ── Tool 3: Lookup vendor assessment ────────────────────────────────────
  const lookupVendorAssessmentTool = tool(
    async ({ vendorName }) => {
      try {
        emit?.('status', { message: `Looking up assessment for ${vendorName}...` });
        // Dynamic import to avoid circular deps during init
        const { Assessment } = await import('../models/Assessment.js');
        const assessment = await Assessment.findOne({
          workspaceId,
          vendorName: {
            $regex: new RegExp(vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
          },
          status: 'complete',
        })
          .sort({ createdAt: -1 })
          .lean();

        if (!assessment) return `No completed DORA assessment found for vendor: ${vendorName}`;

        const risk = assessment.results?.overallRisk || 'Unknown';
        const summary = assessment.results?.summary || '';
        const gaps = assessment.results?.gaps || [];
        const missing = gaps.filter((g) => g.gapLevel === 'missing').slice(0, 5);
        const partial = gaps.filter((g) => g.gapLevel === 'partial').slice(0, 3);

        addDoc({
          pageContent: `DORA Assessment for ${assessment.vendorName} (${assessment.createdAt?.toISOString?.().split('T')[0]}): Overall Risk: ${risk}. ${summary} Missing obligations: ${missing.map((g) => g.article).join(', ') || 'None'}.`,
          metadata: {
            sourceType: 'assessment',
            documentTitle: `DORA Assessment: ${assessment.vendorName}`,
            assessmentId: assessment._id.toString(),
          },
        });

        const missingLines = missing.map((g) => `  - ${g.article}: ${g.requirement}`).join('\n');
        const partialLines = partial.map((g) => `  - ${g.article}: ${g.requirement}`).join('\n');
        return [
          `Vendor: ${assessment.vendorName}`,
          `Overall Risk: ${risk}`,
          `Summary: ${summary}`,
          `Missing obligations:\n${missingLines || '  None'}`,
          `Partially covered:\n${partialLines || '  None'}`,
        ].join('\n');
      } catch (err) {
        logger.warn('lookup_vendor_assessment tool error', {
          service: 'rag-agent',
          error: err.message,
        });
        return `Assessment lookup error: ${err.message}`;
      }
    },
    {
      name: 'lookup_vendor_assessment',
      description:
        "Retrieve a completed DORA compliance gap analysis for a specific ICT vendor. Use when asked about a vendor's compliance status, risk level, or identified gaps.",
      schema: z.object({
        vendorName: z.string().describe('Name of the ICT vendor to look up'),
      }),
    }
  );

  // ── Tool 4: Signal retrieval complete ────────────────────────────────────
  const doneSearchingTool = tool(
    async ({ summary }) => {
      return `Retrieval complete. Context summary: ${summary}`;
    },
    {
      name: 'done_searching',
      description:
        'Call this when you have gathered sufficient context to answer the question. This ends the retrieval phase.',
      schema: z.object({
        summary: z.string().describe('Brief summary of what was found (1-2 sentences)'),
      }),
    }
  );

  return {
    tools: [
      searchKnowledgeBaseTool,
      searchDoraArticlesTool,
      lookupVendorAssessmentTool,
      doneSearchingTool,
    ],
    getCollectedDocuments: () => collectedDocuments,
  };
}

// ---------------------------------------------------------------------------
// Main export — called by RAGService.askWithConversation()
// ---------------------------------------------------------------------------

/**
 * Run the agentic retrieval phase.
 *
 * @param {Object} params
 * @param {string}   params.question       Search query (already rephrased for history)
 * @param {Object}   params.vectorStore    LangChain QdrantVectorStore (tenant-isolated)
 * @param {string}   params.workspaceId    Qdrant workspace ID for MongoDB queries
 * @param {Object}   params.qdrantFilter   Pre-built Qdrant filter (includes workspace)
 * @param {Array}    params.history        LangChain message history (HumanMessage/AIMessage)
 * @param {Function} params.emit           Validated streaming emit callback
 * @param {Object}   params.llm            LangChain LLM instance (from RAGService)
 * @returns {Promise<{documents: Array}>}  Accumulated LangChain Documents
 */
export async function runRetrievalAgent({
  question,
  vectorStore,
  workspaceId,
  qdrantFilter,
  history = [],
  emit = null,
  llm,
}) {
  const { tools, getCollectedDocuments } = buildRetrievalTools(
    vectorStore,
    workspaceId,
    qdrantFilter,
    emit
  );

  const agent = createReactAgent({
    llm,
    tools,
    stateModifier: new SystemMessage(SYSTEM_PROMPT),
  });

  // Include recent history as context so the agent understands the question scope
  const historyStr =
    history.length > 0
      ? `\nRecent conversation:\n${history
          .slice(-4)
          .map((m) => {
            const role =
              m._getType?.() || (m.constructor?.name?.includes('Human') ? 'user' : 'assistant');
            return `${role}: ${String(m.content).slice(0, 200)}`;
          })
          .join('\n')}\n`
      : '';

  const userMessage = `${historyStr}Question: "${question}"\n\nSearch the knowledge base for relevant information, then call done_searching when ready.`;

  try {
    await agent.invoke(
      { messages: [new HumanMessage(userMessage)] },
      { recursionLimit: 30 } // max graph steps (each tool call = 2 steps)
    );
  } catch (err) {
    const docs = getCollectedDocuments();
    // Recursion limit is acceptable if we collected something
    if (docs.length > 0) {
      logger.warn('Retrieval agent hit recursion limit, using partial results', {
        service: 'rag-agent',
        collectedCount: docs.length,
        error: err.message,
      });
    } else {
      // Truly failed with nothing collected — surface the error
      throw err;
    }
  }

  const documents = getCollectedDocuments();

  logger.info('Retrieval agent completed', {
    service: 'rag-agent',
    question: question.slice(0, 100),
    documentsCollected: documents.length,
  });

  return { documents };
}
