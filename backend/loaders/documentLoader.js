import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import logger from '../config/logger.js';

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
 * Detect section headers from document content
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
 * Load and split document content into chunks (character-based)
 *
 * @param {string} content - Document content (markdown/text)
 * @param {Object} metadata - Document metadata
 * @returns {Promise<Array>} Array of document chunks with enriched metadata
 */
export const loadAndSplitDocument = async (content, metadata = {}) => {
  try {
    logger.debug(`Processing document: ${metadata.title || 'Untitled'}`);

    // Create document object for text splitter
    const docs = [
      {
        pageContent: content,
        metadata: {
          source: metadata.url || `doc://${metadata.sourceId}`,
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
          sourceType: metadata.sourceType || 'file',
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

    logger.debug(`Created ${enrichedSplits.length} chunks for document`);
    return enrichedSplits;
  } catch (error) {
    logger.error('Failed to load and split document:', error);
    throw error;
  }
};

/**
 * Prepare document for indexing
 *
 * @param {Object} document - Document object
 * @param {string} workspaceId - Workspace ID
 * @param {Array|null} blocks - Optional blocks array (reserved for future block-aware chunking)
 * @param {string} sourceType - Source type (e.g. 'pdf', 'docx', 'url', 'file')
 * @returns {Promise<Array>} Array of chunks ready for vector store
 */
export const prepareDocumentForIndexing = async (
  document,
  workspaceId,
  blocks = null,
  sourceType = 'file'
) => {
  try {
    const metadata = {
      workspaceId,
      sourceType,
      sourceId: document.sourceId,
      title: document.title,
      url: document.url,
      author: document.author,
      createdAt: document.createdAt,
      lastModified: document.lastModified,
      properties: document.properties,
      icon: document.icon,
      archived: document.archived,
      parentId: document.parentId,
      parentType: document.parentType,
      documentType: 'page',
    };

    // blocks param reserved for future block-aware chunking; currently unused
    void blocks;

    return await loadAndSplitDocument(document.content, metadata);
  } catch (error) {
    logger.error('Failed to prepare document for indexing:', error);
    throw error;
  }
};

export default {
  loadAndSplitDocument,
  prepareDocumentForIndexing,
  shouldIndexChunk,
};
