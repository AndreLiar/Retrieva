/**
 * Notion Sync Helper Functions
 *
 * Document filtering and sync determination logic for Notion sync worker.
 * Extracted from notionSyncWorker.js for modularity.
 *
 * @module workers/notionSyncHelpers
 */

import { DocumentSource } from '../models/DocumentSource.js';

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

  return notionDocuments.filter((doc) => {
    const lastEdited = new Date(doc.last_edited_time);
    return lastEdited > lastSyncTime;
  });
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

  if (!contentChanged && syncType === 'incremental') {
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
