/**
 * Context formatting utilities for RAG
 * Formats documents and sources for LLM context
 * @module utils/contextFormatter
 */

/**
 * @typedef {Object} DocumentMetadata
 * @property {string} [documentTitle] - Title of the source document
 * @property {string} [section] - Section within the document
 * @property {string} [documentUrl] - URL of the document
 * @property {string} [source] - Alternative source path/URL
 * @property {string} [documentType] - Type of document (page, database, etc.)
 * @property {string} [block_type] - Type of content block
 * @property {string[]} [heading_path] - Breadcrumb path of headings
 * @property {number} [positionPercent] - Position in document (0-100)
 * @property {number} [score] - Relevance score
 * @property {number} [rrfScore] - RRF fusion score
 */

/**
 * @typedef {Object} Document
 * @property {string} pageContent - The text content of the document
 * @property {DocumentMetadata} [metadata] - Document metadata
 */

/**
 * @typedef {Object} ChunkInfo
 * @property {string|null} blockType - Type of content block
 * @property {string[]} headingPath - Breadcrumb path of headings
 * @property {number|null} position - Position in document
 */

/**
 * @typedef {Object} FormattedSource
 * @property {string} id - Unique source identifier (for frontend compatibility)
 * @property {number} sourceNumber - 1-based source reference number
 * @property {string} title - Document title
 * @property {string} content - Preview of chunk content (for frontend display)
 * @property {string} url - Document URL
 * @property {string|null} pageId - Source page/document ID
 * @property {number|null} score - Relevance score as number (for frontend compatibility)
 * @property {string|null} section - Section within document
 * @property {string} type - Document type
 * @property {string|null} relevanceScore - Relevance score (4 decimal places) - legacy
 * @property {ChunkInfo} chunkInfo - Chunk metadata
 */

/**
 * Format documents into context string with source citations
 * Creates numbered source headers for LLM context
 *
 * @param {Document[]} docs - Documents to format
 * @returns {string} Formatted context string with [Source N] headers
 */
export function formatContext(docs) {
  return docs
    .map((doc, index) => {
      const docTitle = doc.metadata?.documentTitle || 'Untitled';
      const headingPath = doc.metadata?.heading_path;
      const sourceNum = index + 1;

      // Use full heading breadcrumb for hierarchical disambiguation.
      // Falls back to legacy section field for backward compatibility.
      const sectionLabel = headingPath?.length > 0
        ? headingPath.join(' > ')
        : (doc.metadata?.section || '');

      const header = sectionLabel && sectionLabel !== 'General'
        ? `[Source ${sourceNum}: ${docTitle} - ${sectionLabel}]`
        : `[Source ${sourceNum}: ${docTitle}]`;

      return `${header}\n${doc.pageContent}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Format documents into source metadata array
 * Extracts and structures metadata for response
 *
 * @param {Document[]} docs - Documents to format
 * @returns {FormattedSource[]} Array of formatted source metadata
 */
export function formatSources(docs) {
  return docs.map((doc, index) => {
    const sourceNumber = index + 1;
    const relevanceScore = doc.rrfScore || doc.score || null;

    // Use original content for display (before compression) if available
    // This ensures source display shows actual document content, not LLM-compressed text
    const fullContent = doc.metadata?._originalContent || doc.pageContent || '';
    let contentPreview = fullContent.substring(0, 200);
    if (fullContent.length > 200) {
      const lastSpace = contentPreview.lastIndexOf(' ');
      if (lastSpace > 150) {
        contentPreview = contentPreview.substring(0, lastSpace);
      }
      contentPreview += '...';
    }

    return {
      // Frontend-compatible fields
      id: doc.metadata?.sourceId || `source-${sourceNumber}`,
      title: doc.metadata?.documentTitle || 'Untitled',
      content: contentPreview,
      url: doc.metadata?.documentUrl || doc.metadata?.source || '',
      pageId: doc.metadata?.sourceId || null,
      score: relevanceScore ? parseFloat(relevanceScore.toFixed(4)) : null,

      // Extended metadata
      sourceNumber,
      section: doc.metadata?.section || null,
      type: doc.metadata?.documentType || 'page',
      relevanceScore: relevanceScore?.toFixed(4) || null, // Legacy string format
      chunkInfo: {
        blockType: doc.metadata?.block_type || null,
        headingPath: doc.metadata?.heading_path || [],
        position: doc.metadata?.positionPercent || null,
      },
    };
  });
}

/**
 * Deduplicate documents by content
 * Uses first 100 characters as fingerprint for comparison
 *
 * @param {Document[]} docs - Documents to deduplicate
 * @returns {Document[]} Unique documents (first occurrence preserved)
 */
export function deduplicateDocuments(docs) {
  const uniqueDocs = [];
  const seenContent = new Set();

  for (const doc of docs) {
    const contentKey = doc.metadata?.contentFingerprint || doc.pageContent.substring(0, 100);
    if (!seenContent.has(contentKey)) {
      seenContent.add(contentKey);
      uniqueDocs.push(doc);
    }
  }

  return uniqueDocs;
}
