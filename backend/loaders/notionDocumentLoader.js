import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import logger from '../config/logger.js';

import { estimateTokens } from '../utils/rag/tokenEstimation.js';

/**
 * Junk patterns — chunks matching these are noise with no retrieval value
 */
const JUNK_PATTERNS = [
  /^\[Table of Contents\]$/i,
  /^\[Breadcrumb\]$/i,
  /^---+$/,
  /^\[Link to page\]$/i,
  /^\s*$/,
  /^[-_=\s]+$/, // separator-only
];

/**
 * Quality gate: decide whether a semantic group should be indexed.
 * Rejects trivially small or junk chunks.
 *
 * @param {Object} group - Semantic group with content and tokens
 * @returns {boolean} true if the chunk should be indexed
 */
export const shouldIndexChunk = (group) => {
  const trimmed = (group.content || '').trim();

  if (trimmed.length < 20) return false;
  if ((group.tokens || 0) < 10) return false;

  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  return true;
};

/**
 * Detect section headers from Notion markdown content
 * @param {string} text - Text to analyze
 * @returns {string|null} - Detected section
 */
const detectSection = (text) => {
  const sectionPatterns = [
    /^#+ (.+)/m, // Markdown headers
    /^([A-Z][A-Za-z\s]+):$/m, // "Section Name:"
    /^\d+\.?\s+([A-Z][A-Za-z\s]+)/m, // "1. Section Name"
    /^([A-Z\s]{3,})$/m, // ALL CAPS HEADERS
  ];

  for (const pattern of sectionPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
};

/**
 * NEW: Semantic chunking with Notion blocks
 * Phase 3: Replace character-based splitting with block-aware semantic chunking
 *
 * @param {Array} blocks - Notion blocks array from NotionAdapter.fetchDocument()
 * @param {Object} metadata - Document metadata
 * @returns {Promise<Array>} Array of semantically chunked documents
 */
export const loadAndChunkNotionBlocks = async (_blocks, _metadata = {}) => {
  // Block-based chunking not available in MVP (notionTransformer removed)
  logger.warn('loadAndChunkNotionBlocks called but notionTransformer is not available in MVP', {
    service: 'notion-loader',
  });
  return [];
};

/**
 * LEGACY: Load and split Notion document content into chunks (character-based)
 * Kept for backward compatibility - new code should use loadAndChunkNotionBlocks()
 *
 * @param {string} content - Notion document content (markdown/text)
 * @param {Object} metadata - Document metadata
 * @returns {Promise<Array>} Array of document chunks with enriched metadata
 */
export const loadAndSplitNotionDocument = async (content, metadata = {}) => {
  try {
    logger.debug(`Processing Notion document (legacy): ${metadata.title || 'Untitled'}`);

    // Create document object for text splitter
    const docs = [
      {
        pageContent: content,
        metadata: {
          source: metadata.url || `notion://${metadata.sourceId}`,
          ...metadata,
        },
      },
    ];

    // Use same chunking strategy as PDF loader for consistency
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 600, // Smaller chunks for precision
      chunkOverlap: 100, // Maintain context
      separators: [
        '\n\n', // Paragraph boundaries
        '\n', // Line breaks
        '. ', // Sentence endings
        '! ', // Exclamation sentences
        '? ', // Question sentences
        '; ', // Semicolon breaks
        ', ', // Comma breaks
        ' ', // Word boundaries
        '', // Character level (fallback)
      ],
      keepSeparator: true,
      lengthFunction: (text) => text.length,
    });

    const splits = await textSplitter.splitDocuments(docs);

    // Enrich chunks with metadata
    const enrichedSplits = splits.map((split, index) => {
      // Detect section from content
      const section = detectSection(split.pageContent);

      // Calculate position in document
      const position = (((index + 1) / splits.length) * 100).toFixed(1);

      return {
        ...split,
        metadata: {
          ...split.metadata,
          // Source-specific metadata
          workspaceId: metadata.workspaceId,
          sourceType: metadata.sourceType || 'notion',
          sourceId: metadata.sourceId,
          documentTitle: metadata.title,
          documentUrl: metadata.url,
          documentType: metadata.documentType || 'page',

          // Author and timestamps
          author: metadata.author,
          createdAt: metadata.createdAt,
          lastModified: metadata.lastModified,

          // Document classification for access control filtering
          classification: metadata.classification || 'internal',

          // Notion properties (tags, status, etc.)
          notionProperties: metadata.properties || {},

          // Chunk metadata
          section: section || 'General',
          chunkIndex: index,
          totalChunks: splits.length,
          positionPercent: `${position}%`,
          chunkSize: split.pageContent.length,

          // Parent information
          parentId: metadata.parentId,
          parentType: metadata.parentType,

          // Additional fields
          icon: metadata.icon,
          archived: metadata.archived,
        },
      };
    });

    logger.debug(`Created ${enrichedSplits.length} chunks for Notion document`);
    return enrichedSplits;
  } catch (error) {
    logger.error('Failed to load and split Notion document:', error);
    throw error;
  }
};

/**
 * Prepare Notion document for indexing with semantic chunking
 * NEW: Uses blocks-based semantic chunking when blocks are available
 *
 * @param {Object} notionDocument - Document from NotionAdapter
 * @param {string} workspaceId - Notion workspace ID
 * @param {Array} blocks - Optional: Notion blocks array (preferred for semantic chunking)
 * @returns {Promise<Array>} Array of chunks ready for vector store
 */
export const prepareNotionDocumentForIndexing = async (
  notionDocument,
  workspaceId,
  blocks = null,
  sourceType = 'notion'
) => {
  try {
    const metadata = {
      workspaceId,
      sourceType,
      sourceId: notionDocument.sourceId,
      title: notionDocument.title,
      url: notionDocument.url,
      author: notionDocument.author,
      createdAt: notionDocument.createdAt,
      lastModified: notionDocument.lastModified,
      properties: notionDocument.properties,
      icon: notionDocument.icon,
      archived: notionDocument.archived,
      parentId: notionDocument.parentId,
      parentType: notionDocument.parentType,
      documentType: 'page',
    };

    // Use semantic chunking if blocks are provided (preferred)
    if (blocks && blocks.length > 0) {
      logger.info('Using semantic block-based chunking', {
        service: 'notion-loader',
        pageTitle: metadata.title,
        blockCount: blocks.length,
      });
      return await loadAndChunkNotionBlocks(blocks, metadata);
    }

    // Fallback to legacy character-based chunking
    logger.info('Using legacy character-based chunking', {
      service: 'notion-loader',
      pageTitle: metadata.title,
    });
    return await loadAndSplitNotionDocument(notionDocument.content, metadata);
  } catch (error) {
    logger.error('Failed to prepare Notion document for indexing:', error);
    throw error;
  }
};

export default {
  loadAndSplitNotionDocument,
  loadAndChunkNotionBlocks,
  prepareNotionDocumentForIndexing,
  shouldIndexChunk,
};
