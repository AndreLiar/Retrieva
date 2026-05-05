/**
 * complianceKbRetriever.js
 *
 * Retrieves DORA regulation text from the shared, read-only `compliance_kb`
 * Qdrant collection (seeded by `backend/scripts/seedComplianceKb.js`).
 *
 * Unlike the workspace retriever, this collection has no tenant filter —
 * regulation text is public reference data, identical for every workspace.
 *
 * Returned documents are tagged with `metadata.source = 'regulation'` and a
 * human-readable `documentTitle` (e.g. `"DORA Article 28: ICT third-party risk"`)
 * so the existing context formatter and citation pipeline render them
 * distinctly from vendor-uploaded documents.
 */

import { QdrantVectorStore } from '@langchain/qdrant';
import { embeddings as defaultEmbeddings } from '../../config/embeddings.js';
import logger from '../../config/logger.js';

export const COMPLIANCE_KB_COLLECTION = 'compliance_kb';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

let cachedStore = null;
let cachedStorePromise = null;

/**
 * Lazy-init the QdrantVectorStore for the compliance_kb collection.
 * Returns null if the collection is unavailable so callers can gracefully
 * degrade to vendor-only retrieval (e.g. local dev without seed run).
 */
async function getComplianceKbStore(embeddings = defaultEmbeddings) {
  if (cachedStore) return cachedStore;
  if (cachedStorePromise) return cachedStorePromise;

  cachedStorePromise = (async () => {
    try {
      const store = await QdrantVectorStore.fromExistingCollection(embeddings, {
        url: QDRANT_URL,
        apiKey: QDRANT_API_KEY,
        collectionName: COMPLIANCE_KB_COLLECTION,
        contentPayloadKey: 'pageContent',
      });
      cachedStore = store;
      return store;
    } catch (error) {
      logger.warn('compliance_kb collection unavailable — regulation retrieval disabled', {
        service: 'compliance-kb-retriever',
        collection: COMPLIANCE_KB_COLLECTION,
        error: error.message,
      });
      return null;
    } finally {
      cachedStorePromise = null;
    }
  })();

  return cachedStorePromise;
}

/**
 * Map a raw compliance_kb document to the shape the RAG context formatter
 * expects, so citations render as the article number rather than "Untitled".
 */
function adaptRegulationDoc(doc) {
  const meta = doc.metadata || {};
  const regulation = meta.regulation || 'Regulation';
  const article = meta.article || '';
  const title = meta.title || '';

  const documentTitle =
    [regulation, article].filter(Boolean).join(' ') + (title ? `: ${title}` : '');

  return {
    pageContent: doc.pageContent,
    metadata: {
      ...meta,
      source: 'regulation',
      documentTitle: documentTitle || regulation,
      heading_path: [regulation, article].filter(Boolean),
      documentType: 'regulation',
    },
  };
}

/**
 * Retrieve top-k regulation chunks for a query.
 * Returns an empty array if the collection is missing or any error occurs —
 * regulation context is additive, never load-bearing.
 *
 * @param {string} query
 * @param {number} [k=5]
 * @returns {Promise<Array<{pageContent: string, metadata: object}>>}
 */
export async function retrieveRegulationDocs(query, k = 5) {
  if (!query || typeof query !== 'string') return [];

  const store = await getComplianceKbStore();
  if (!store) return [];

  try {
    const docs = await store.similaritySearch(query, k);
    return docs.map(adaptRegulationDoc);
  } catch (error) {
    logger.warn('compliance_kb similarity search failed', {
      service: 'compliance-kb-retriever',
      error: error.message,
    });
    return [];
  }
}

/**
 * Test-only: reset the cached store (used by unit tests).
 */
export function _resetForTests() {
  cachedStore = null;
  cachedStorePromise = null;
}
