/**
 * Notion Sync Helper Functions
 *
 * Document filtering and sync determination logic for Notion sync worker.
 * Extracted from notionSyncWorker.js for modularity.
 *
 * @module workers/notionSyncHelpers
 */

import { DocumentSource } from '../models/DocumentSource.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import logger from '../config/logger.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';

/**
 * Filter documents based on workspace settings
 *
 * @param {Array} documents - All Notion documents
 * @param {Object} workspace - Workspace model
 * @param {Object} options - Additional filter options
 * @returns {Array} Filtered documents
 */
export function filterDocuments(documents, workspace, options) {
  let filtered = documents;

  // Apply sync scope filter
  if (workspace.syncScope === 'specific_pages' && workspace.includedPages.length > 0) {
    filtered = filtered.filter((doc) => workspace.includedPages.includes(doc.id));
  } else if (workspace.syncScope === 'databases_only') {
    filtered = filtered.filter((doc) => doc.object === 'database');
  }

  // Exclude specific pages
  if (workspace.excludedPages && workspace.excludedPages.length > 0) {
    filtered = filtered.filter((doc) => !workspace.excludedPages.includes(doc.id));
  }

  // Filter archived documents
  filtered = filtered.filter((doc) => !doc.archived);

  // Apply custom document IDs if provided
  if (options.documentIds && options.documentIds.length > 0) {
    filtered = filtered.filter((doc) => options.documentIds.includes(doc.id));
  }

  return filtered;
}

/**
 * Detect documents with MongoDB/Qdrant desync
 * These are documents with chunkCount > 0 in MongoDB but no vectors in Qdrant
 *
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Set<string>>} Set of desync'd document source IDs
 */
export async function detectDesyncedDocuments(workspaceId) {
  const desyncedIds = new Set();

  try {
    // Find documents that claim to have chunks
    const docsWithChunks = await DocumentSource.find({
      workspaceId,
      chunkCount: { $gt: 0 },
      syncStatus: { $ne: 'deleted' },
    }).select('sourceId chunkCount').lean();

    if (docsWithChunks.length === 0) {
      return desyncedIds;
    }

    const client = new QdrantClient({ url: QDRANT_URL });

    // Check each document in Qdrant (batch for efficiency)
    // Process in batches of 50 to avoid overwhelming Qdrant
    const batchSize = 50;
    for (let i = 0; i < docsWithChunks.length; i += batchSize) {
      const batch = docsWithChunks.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (doc) => {
          try {
            const result = await client.count(COLLECTION_NAME, {
              filter: {
                must: [
                  { key: 'metadata.workspaceId', match: { value: workspaceId } },
                  { key: 'metadata.sourceId', match: { value: doc.sourceId } },
                ],
              },
              exact: true,
            });

            const actualCount = result.count || 0;

            // Desync detected: MongoDB says chunkCount > 0, but Qdrant has 0 or fewer
            if (actualCount === 0 || actualCount < doc.chunkCount * 0.5) {
              desyncedIds.add(doc.sourceId);
              logger.warn('Detected MongoDB/Qdrant desync', {
                service: 'notion-sync',
                workspaceId,
                sourceId: doc.sourceId,
                mongoChunkCount: doc.chunkCount,
                qdrantVectorCount: actualCount,
              });
            }
          } catch (err) {
            // If we can't verify, assume it needs re-sync to be safe
            desyncedIds.add(doc.sourceId);
            logger.warn('Failed to verify document in Qdrant, marking for re-sync', {
              service: 'notion-sync',
              workspaceId,
              sourceId: doc.sourceId,
              error: err.message,
            });
          }
        })
      );
    }

    if (desyncedIds.size > 0) {
      logger.info(`Found ${desyncedIds.size} documents with MongoDB/Qdrant desync`, {
        service: 'notion-sync',
        workspaceId,
      });
    }
  } catch (error) {
    logger.error('Failed to detect desynced documents', {
      service: 'notion-sync',
      workspaceId,
      error: error.message,
    });
  }

  return desyncedIds;
}

/**
 * Determine which documents need syncing
 *
 * @param {Array} notionDocuments - Filtered Notion documents
 * @param {Object} workspace - Workspace model
 * @param {string} syncType - 'full' or 'incremental'
 * @returns {Promise<Array>} Documents that need syncing
 */
export async function determineDocumentsToSync(notionDocuments, workspace, syncType) {
  if (syncType === 'full') {
    return notionDocuments; // Sync all documents
  }

  // For incremental sync, only sync documents modified since last sync
  const lastSyncTime = workspace.lastSuccessfulSyncAt || new Date(0);

  const modifiedDocs = notionDocuments.filter((doc) => {
    const lastEdited = new Date(doc.last_edited_time);
    return lastEdited > lastSyncTime;
  });

  // CRITICAL: Also include documents with MongoDB/Qdrant desync
  // This catches documents where indexing silently failed (e.g., embedding API errors)
  const desyncedIds = await detectDesyncedDocuments(workspace.workspaceId);

  if (desyncedIds.size === 0) {
    return modifiedDocs;
  }

  // Add desynced documents that aren't already in the modified list
  const modifiedIds = new Set(modifiedDocs.map((doc) => doc.id));
  const desyncedDocs = notionDocuments.filter(
    (doc) => desyncedIds.has(doc.id) && !modifiedIds.has(doc.id)
  );

  if (desyncedDocs.length > 0) {
    logger.info(`Adding ${desyncedDocs.length} desynced documents to sync queue`, {
      service: 'notion-sync',
      workspaceId: workspace.workspaceId,
    });
  }

  return [...modifiedDocs, ...desyncedDocs];
}

/**
 * Detect documents that were deleted from Notion
 *
 * @param {Object} workspace - Workspace model
 * @param {Array} currentNotionDocs - Current documents in Notion
 * @returns {Promise<Array>} Deleted document records
 */
export async function detectDeletedDocuments(workspace, currentNotionDocs) {
  const currentNotionIds = currentNotionDocs.map((doc) => doc.id);

  const deletedDocs = await DocumentSource.find({
    workspaceId: workspace.workspaceId,
    sourceType: 'notion',
    syncStatus: { $ne: 'deleted' },
    sourceId: { $nin: currentNotionIds },
  });

  return deletedDocs;
}

/**
 * Process a single document for syncing
 *
 * @param {Object} doc - Notion document
 * @param {Object} workspace - Workspace model
 * @param {Object} adapter - Notion adapter
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
export async function processDocument(doc, workspace, adapter, options) {
  const { documentIndexQueue, syncType } = options;
  const workspaceId = workspace.workspaceId;

  // Check if document exists in our database
  const existingDoc = await DocumentSource.findOne({
    workspaceId,
    sourceId: doc.id,
  });

  // Fetch full document content
  const documentContent = await adapter.getDocumentContent(doc.id);

  // Skip empty or minimal content documents
  if (!documentContent.content || documentContent.content.trim().length < 50) {
    return { status: 'skipped', reason: 'minimal_content' };
  }

  // Check if content has changed
  const contentChanged = !existingDoc || existingDoc.contentHash !== documentContent.contentHash;

  // Force re-sync if document has an error status (likely MongoDB/Qdrant desync)
  const needsResync =
    existingDoc?.syncStatus === 'error' ||
    (existingDoc?.chunkCount > 0 && existingDoc?.vectorStoreIds?.length === 0);

  if (!contentChanged && !needsResync && syncType === 'incremental') {
    return { status: 'skipped', reason: 'unchanged' };
  }

  // Queue document for indexing
  await documentIndexQueue.add('indexDocument', {
    workspaceId,
    sourceId: doc.id,
    documentContent,
    operation: existingDoc ? 'update' : 'add',
  });

  // Update or create DocumentSource record
  if (existingDoc) {
    existingDoc.title = documentContent.title;
    existingDoc.url = documentContent.url;
    existingDoc.contentHash = documentContent.contentHash;
    existingDoc.lastModifiedInSource = new Date(documentContent.lastModified);
    existingDoc.syncStatus = 'pending';
    existingDoc.metadata = {
      ...existingDoc.metadata,
      author: documentContent.author,
      properties: documentContent.properties,
    };
    await existingDoc.save();
    return { status: 'updated', documentContent };
  } else {
    await DocumentSource.findOneAndUpdate(
      { workspaceId, sourceId: doc.id },
      {
        workspaceId,
        sourceType: 'notion',
        sourceId: doc.id,
        documentType: doc.object === 'database' ? 'database' : 'page',
        title: documentContent.title,
        url: documentContent.url,
        contentHash: documentContent.contentHash,
        lastModifiedInSource: new Date(documentContent.lastModified),
        syncStatus: 'pending',
        metadata: {
          author: documentContent.author,
          createdAt: new Date(documentContent.createdAt),
          properties: documentContent.properties,
        },
      },
      { upsert: true, new: true }
    );
    return { status: 'added', documentContent };
  }
}

/**
 * Build sync results object
 *
 * @param {Object} options - Result options
 * @returns {Object} Sync results
 */
export function buildSyncResults(options = {}) {
  return {
    documentsAdded: options.documentsAdded || 0,
    documentsUpdated: options.documentsUpdated || 0,
    documentsDeleted: options.documentsDeleted || 0,
    documentsSkipped: options.documentsSkipped || 0,
    chunksCreated: options.chunksCreated || 0,
    errors: options.errors || [],
    skippedDocuments: options.skippedDocuments || [],
  };
}
