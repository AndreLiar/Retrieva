import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import logger from '../config/logger.js';
import { groupBlocksSemantically } from '../services/notionTransformer.js';

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
export const loadAndChunkNotionBlocks = async (blocks, metadata = {}) => {
  try {
    logger.info(`Processing Notion blocks semantically: ${metadata.title || 'Untitled'}`, {
      service: 'notion-loader',
      totalBlocks: blocks?.length || 0,
    });

    if (!blocks || blocks.length === 0) {
      logger.warn('No blocks to process', { service: 'notion-loader' });
      return [];
    }

    // Phase 1 & 2: Group blocks semantically with heading paths
    const semanticGroups = groupBlocksSemantically(blocks);

    logger.info(`Created ${semanticGroups.length} semantic groups`, {
      service: 'notion-loader',
      avgTokens: semanticGroups.reduce((sum, g) => sum + g.tokens, 0) / semanticGroups.length,
      categories: semanticGroups.reduce((acc, g) => {
        acc[g.category] = (acc[g.category] || 0) + 1;
        return acc;
      }, {}),
    });

    // SAFETY CHECK: Split oversized chunks that exceed embedding model's context window
    // nomic-embed-text has 2048 token limit, use 1500 as safe margin
    const MAX_CHUNK_TOKENS = 1500;
    const CHARS_PER_TOKEN = 4; // Approximate ratio
    const MAX_CHUNK_CHARS = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN; // ~6000 chars

    const processedGroups = [];
    let splitCount = 0;

    for (const group of semanticGroups) {
      // Check if chunk exceeds safe limits
      if (group.tokens > MAX_CHUNK_TOKENS || group.content.length > MAX_CHUNK_CHARS) {
        logger.warn(`Chunk exceeds embedding limit, splitting recursively`, {
          service: 'notion-loader',
          category: group.category,
          tokens: group.tokens,
          chars: group.content.length,
          maxTokens: MAX_CHUNK_TOKENS,
          headingPath: group.headingPath.join(' > '),
        });

        // Create text splitter for oversized chunks
        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: MAX_CHUNK_CHARS,
          chunkOverlap: 200,
          separators: ['\n\n', '\n', '. ', ' ', ''],
        });

        const subChunks = await splitter.splitText(group.content);
        splitCount += subChunks.length;

        logger.info(`Split oversized chunk into ${subChunks.length} sub-chunks`, {
          service: 'notion-loader',
          originalTokens: group.tokens,
          avgSubChunkSize: Math.round(
            subChunks.reduce((sum, c) => sum + c.length, 0) / subChunks.length
          ),
        });

        // Create processed groups for each sub-chunk
        subChunks.forEach((subContent, subIndex) => {
          processedGroups.push({
            content: subContent,
            category: `${group.category}_split`,
            headingPath: group.headingPath,
            blockTypes: group.blockTypes,
            tokens: Math.round(subContent.length / CHARS_PER_TOKEN),
            blockCount: Math.round(group.blockCount / subChunks.length),
            startIndex: group.startIndex,
            codeLanguage: group.codeLanguage,
            // Split-specific metadata
            isOversizedSplit: true,
            originalTokens: group.tokens,
            splitIndex: subIndex,
            splitTotal: subChunks.length,
          });
        });
      } else {
        // Normal-sized chunk, use as-is
        processedGroups.push(group);
      }
    }

    if (splitCount > 0) {
      logger.info(`Processed ${splitCount} oversized chunks via recursive splitting`, {
        service: 'notion-loader',
        originalGroups: semanticGroups.length,
        finalGroups: processedGroups.length,
      });
    }

    // Convert processed groups to LangChain document format
    const chunks = processedGroups.map((group, index) => ({
      pageContent: group.content,
      metadata: {
        // Page-level metadata
        source: metadata.url || `notion://${metadata.sourceId}`,
        sourceType: 'notion',
        sourceId: metadata.sourceId,
        workspaceId: metadata.workspaceId,
        documentTitle: metadata.title,
        documentUrl: metadata.url,
        documentType: metadata.documentType || 'page',

        // Author and timestamps
        author: metadata.author,
        createdAt: metadata.createdAt,
        lastModified: metadata.lastModified,

        // Notion properties
        notionProperties: metadata.properties || {},
        archived: metadata.archived,
        icon: metadata.icon,

        // Parent information
        parentId: metadata.parentId,
        parentType: metadata.parentType,

        // Chunk-specific metadata
        chunkIndex: index,
        totalChunks: semanticGroups.length,
        chunkSize: group.content.length,

        // CRITICAL NEW METADATA (Phase 2 & 3)
        block_type: group.category, // "heading_group", "list", "code", "table", "callout"
        heading_path: group.headingPath, // ["Finance", "Invoices", "Approval Rules"]
        block_types_in_chunk: group.blockTypes, // ["heading_2", "paragraph", "bulleted_list_item"]

        // Size metadata
        estimatedTokens: group.tokens,
        blockCount: group.blockCount,
        startBlockIndex: group.startIndex,

        // Special handling flags (Phase 3)
        is_code: group.category === 'code' || group.category === 'code_split',
        is_table: group.category === 'table' || group.category === 'table_split',
        is_list: group.category === 'list' || group.category === 'list_split',
        is_callout: group.category === 'callout' || group.category === 'callout_split',
        code_language: group.codeLanguage || null,

        // Oversized chunk split tracking
        is_oversized_split: group.isOversizedSplit || false,
        original_tokens: group.originalTokens || null,
        split_index: group.splitIndex !== undefined ? group.splitIndex : null,
        split_total: group.splitTotal || null,

        // Legacy compatibility
        section:
          group.headingPath.length > 0
            ? group.headingPath[group.headingPath.length - 1]
            : 'General',
        positionPercent: `${(((index + 1) / processedGroups.length) * 100).toFixed(1)}%`,
      },
    }));

    logger.info(`Semantic chunking complete`, {
      service: 'notion-loader',
      pageTitle: metadata.title,
      totalChunks: chunks.length,
      avgChunkSize: chunks.reduce((sum, c) => sum + c.pageContent.length, 0) / chunks.length,
      avgTokens:
        chunks.reduce((sum, c) => sum + (c.metadata.estimatedTokens || 0), 0) / chunks.length,
      headingPathsFound: chunks.filter((c) => c.metadata.heading_path.length > 0).length,
      codeChunks: chunks.filter((c) => c.metadata.is_code).length,
      tableChunks: chunks.filter((c) => c.metadata.is_table).length,
      listChunks: chunks.filter((c) => c.metadata.is_list).length,
      splitChunks: chunks.filter((c) => c.metadata.is_oversized_split).length,
    });

    return chunks;
  } catch (error) {
    logger.error('Failed to chunk Notion blocks semantically:', error);
    throw error;
  }
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
          // Notion-specific metadata
          workspaceId: metadata.workspaceId,
          sourceType: 'notion',
          sourceId: metadata.sourceId,
          documentTitle: metadata.title,
          documentUrl: metadata.url,
          documentType: metadata.documentType || 'page',

          // Author and timestamps
          author: metadata.author,
          createdAt: metadata.createdAt,
          lastModified: metadata.lastModified,

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
  blocks = null
) => {
  try {
    const metadata = {
      workspaceId,
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
};
