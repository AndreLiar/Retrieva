import { Client } from '@notionhq/client';
import { BaseDocumentSourceAdapter } from './BaseDocumentSourceAdapter.js';
import { NotionRateLimiter } from '../utils/core/notionRateLimiter.js';
import {
  transformBlocksToText,
  extractPageMetadata,
  calculateContentHash,
} from '../services/notionTransformer.js';
import logger from '../config/logger.js';
// FIX 4: Import circuit breaker
import { notionCircuitBreaker } from '../utils/core/circuitBreaker.js';

/**
 * Notion Document Source Adapter
 * Implements integration with Notion API for document synchronization
 */
export class NotionAdapter extends BaseDocumentSourceAdapter {
  constructor() {
    super();
    this.client = null;
    this.rateLimiter = new NotionRateLimiter();
    this.accessToken = null;
  }

  /**
   * Authenticate with Notion using access token
   * @param {string} accessToken - Notion integration access token
   * @returns {Promise<boolean>}
   */
  async authenticate(accessToken) {
    try {
      this.accessToken = accessToken;
      // FIX 1: Increase timeout to 120s for large/deeply nested pages
      this.client = new Client({
        auth: accessToken,
        timeoutMs: 120000, // 120 seconds (default is 60s)
      });

      // Validate token by making a test request
      await this.validateConnection();
      logger.info('Notion adapter authenticated successfully');
      return true;
    } catch (error) {
      logger.error('Notion authentication failed:', error);
      throw new Error(`Notion authentication failed: ${error.message}`);
    }
  }

  /**
   * Validate connection to Notion
   * @returns {Promise<boolean>}
   */
  async validateConnection() {
    try {
      await this.rateLimiter.waitForToken();
      // Make a test request to validate token
      await this.client.users.me();
      return true;
    } catch (error) {
      logger.error('Notion connection validation failed:', error);
      return false;
    }
  }

  /**
   * Get workspace information
   * @returns {Promise<Object>}
   */
  async getWorkspaceInfo() {
    try {
      await this.rateLimiter.waitForToken();
      const botUser = await this.client.users.me();
      return {
        botId: botUser.id,
        botName: botUser.name,
        type: botUser.type,
      };
    } catch (error) {
      logger.error('Failed to get workspace info:', error);
      throw error;
    }
  }

  /**
   * List all accessible pages
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Array of page objects
   */
  async listPages(_options = {}) {
    const pages = [];
    let hasMore = true;
    let startCursor = undefined;

    try {
      while (hasMore) {
        await this.rateLimiter.waitForToken();

        const response = await this.client.search({
          filter: { property: 'object', value: 'page' },
          start_cursor: startCursor,
          page_size: 100,
        });

        pages.push(...response.results);
        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }

      logger.info(`Found ${pages.length} pages in Notion workspace`);
      return pages;
    } catch (error) {
      logger.error('Failed to list pages:', error);
      throw error;
    }
  }

  /**
   * List all accessible databases
   * @returns {Promise<Array>} Array of database objects
   */
  async listDatabases() {
    const databases = [];
    let hasMore = true;
    let startCursor = undefined;

    try {
      while (hasMore) {
        await this.rateLimiter.waitForToken();

        const response = await this.client.search({
          filter: { property: 'object', value: 'database' },
          start_cursor: startCursor,
          page_size: 100,
        });

        databases.push(...response.results);
        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }

      logger.info(`Found ${databases.length} databases in Notion workspace`);
      return databases;
    } catch (error) {
      logger.error('Failed to list databases:', error);
      throw error;
    }
  }

  /**
   * Fetch all documents (pages and databases)
   * @param {Object} options - Filter options
   * @returns {Promise<Array>}
   */
  async listDocuments(options = {}) {
    try {
      const [pages, databases] = await Promise.all([this.listPages(options), this.listDatabases()]);

      return [...pages, ...databases];
    } catch (error) {
      logger.error('Failed to list documents:', error);
      throw error;
    }
  }

  /**
   * Fetch content of a single page including all blocks
   * @param {string} pageId - Notion page ID
   * @returns {Promise<Object>} Page with content
   */
  async fetchDocument(pageId) {
    try {
      // Get page metadata
      await this.rateLimiter.waitForToken();
      const page = await this.client.pages.retrieve({ page_id: pageId });

      // Get page blocks recursively
      const blocks = await this.fetchBlocksRecursively(pageId);

      return {
        ...page,
        blocks,
      };
    } catch (error) {
      logger.error(`Failed to fetch page ${pageId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch blocks recursively (including children)
   * @param {string} blockId - Block ID (page or block)
   * @param {Array} allBlocks - Accumulated blocks
   * @param {number} depth - Current recursion depth
   * @param {number} maxDepth - Maximum recursion depth (optimization)
   * @returns {Promise<Array>} Array of blocks with children
   */
  async fetchBlocksRecursively(blockId, allBlocks = [], depth = 0, maxDepth = null) {
    try {
      // Use environment variable or default to 3 levels deep
      const MAX_DEPTH = maxDepth || parseInt(process.env.MAX_RECURSION_DEPTH) || 3;

      // Stop if we've reached max depth (optimization for deeply nested pages)
      if (depth >= MAX_DEPTH) {
        logger.debug(
          `Reached max recursion depth ${MAX_DEPTH} for block ${blockId}, skipping children`
        );
        return allBlocks;
      }

      let hasMore = true;
      let startCursor = undefined;

      while (hasMore) {
        await this.rateLimiter.waitForToken();

        const response = await this.client.blocks.children.list({
          block_id: blockId,
          start_cursor: startCursor,
          page_size: 100,
        });

        const blocks = response.results;

        // Process each block
        for (const block of blocks) {
          if (block.has_children && depth < MAX_DEPTH - 1) {
            // Recursively fetch children with incremented depth
            block.children = await this.fetchBlocksRecursively(block.id, [], depth + 1, maxDepth);
          }
          allBlocks.push(block);
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }

      return allBlocks;
    } catch (error) {
      logger.error(`Failed to fetch blocks for ${blockId}:`, error);
      // Return what we have so far instead of failing completely
      return allBlocks;
    }
  }

  /**
   * Transform Notion page/blocks to plain text
   * @param {Object} document - Document object from fetchDocument
   * @returns {Promise<string>} Plain text content
   */
  async transformToText(document) {
    try {
      const { blocks } = document;
      const text = transformBlocksToText(blocks);
      return text.trim();
    } catch (error) {
      logger.error('Failed to transform document to text:', error);
      throw error;
    }
  }

  /**
   * Extract standardized metadata from Notion page
   * @param {Object} document - Notion page object
   * @returns {Promise<Object>}
   */
  async extractMetadata(document) {
    try {
      const metadata = {
        sourceId: document.id,
        title: this.extractTitle(document),
        url: document.url,
        createdAt: document.created_time,
        lastModified: document.last_edited_time,
        author: document.created_by?.id,
        archived: document.archived,
        properties: {},
      };

      // Extract properties if available
      if (document.properties) {
        metadata.properties = extractPageMetadata(document.properties);
      }

      // Extract icon
      if (document.icon) {
        metadata.icon =
          document.icon.emoji || document.icon.external?.url || document.icon.file?.url;
      }

      // Extract cover
      if (document.cover) {
        metadata.cover = document.cover.external?.url || document.cover.file?.url;
      }

      // Extract parent info
      if (document.parent) {
        metadata.parentId =
          document.parent.page_id || document.parent.database_id || document.parent.workspace;
        metadata.parentType = document.parent.type;
      }

      return metadata;
    } catch (error) {
      logger.error('Failed to extract metadata:', error);
      throw error;
    }
  }

  /**
   * Extract title from page properties or database title
   * @param {Object} page - Notion page object
   * @returns {string}
   */
  extractTitle(page) {
    // For databases
    if (page.title && Array.isArray(page.title)) {
      return page.title.map((t) => t.plain_text).join('');
    }

    // For pages - look for title property
    if (page.properties) {
      const titleProp = Object.values(page.properties).find((prop) => prop.type === 'title');
      if (titleProp && titleProp.title) {
        return titleProp.title.map((t) => t.plain_text).join('');
      }
    }

    return 'Untitled';
  }

  /**
   * Detect documents that have changed since last sync
   * @param {Date} lastSyncTime - Last successful sync timestamp
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Array of changed document IDs
   */
  async detectChanges(lastSyncTime, options = {}) {
    try {
      const allDocuments = await this.listDocuments(options);

      // Filter documents modified after lastSyncTime
      const changedDocuments = allDocuments.filter((doc) => {
        const lastEdited = new Date(doc.last_edited_time);
        return lastEdited > lastSyncTime;
      });

      logger.info(`Found ${changedDocuments.length} changed documents since ${lastSyncTime}`);
      return changedDocuments;
    } catch (error) {
      logger.error('Failed to detect changes:', error);
      throw error;
    }
  }

  /**
   * Fetch database rows
   * @param {string} databaseId - Database ID
   * @returns {Promise<Array>} Array of page objects (database rows)
   */
  async fetchDatabaseRows(databaseId) {
    const rows = [];
    let hasMore = true;
    let startCursor = undefined;

    try {
      while (hasMore) {
        await this.rateLimiter.waitForToken();

        const response = await this.client.databases.query({
          database_id: databaseId,
          start_cursor: startCursor,
          page_size: 100,
        });

        rows.push(...response.results);
        hasMore = response.has_more;
        startCursor = response.next_cursor;
      }

      logger.info(`Found ${rows.length} rows in database ${databaseId}`);
      return rows;
    } catch (error) {
      logger.error(`Failed to fetch database rows for ${databaseId}:`, error);
      throw error;
    }
  }

  /**
   * Get full document content with metadata, transformed text, AND blocks
   * UPDATED: Now includes blocks array for semantic chunking
   * FIX 4: Protected by circuit breaker
   * @param {string} documentId - Document ID
   * @returns {Promise<Object>}
   */
  async getDocumentContent(documentId) {
    try {
      // FIX 4: Wrap in circuit breaker to prevent cascading failures
      const result = await notionCircuitBreaker.execute(async () => {
        const document = await this.fetchDocument(documentId);
        const metadata = await this.extractMetadata(document);
        const content = await this.transformToText(document);
        const contentHash = await calculateContentHash(content);

        return {
          ...metadata,
          content,
          contentHash,
          blocks: document.blocks || [], // ← CRITICAL: Include blocks for semantic chunking
        };
      }, `Notion API - Document ${documentId}`);

      return result;
    } catch (error) {
      // Check if error is from circuit breaker
      if (error.circuitBreakerOpen) {
        logger.warn(`Circuit breaker blocked request for document ${documentId}`, {
          service: 'notion-adapter',
          documentId,
          circuitState: notionCircuitBreaker.getState(),
        });
      } else {
        logger.error(`Failed to get document content for ${documentId}:`, {
          service: 'notion-adapter',
          documentId,
          error: error.message,
        });
      }
      throw error;
    }
  }

  /**
   * Disconnect from Notion (cleanup)
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.client = null;
    this.accessToken = null;
    logger.info('Notion adapter disconnected');
  }
}

export default NotionAdapter;
