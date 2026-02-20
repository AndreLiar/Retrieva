/**
 * MCPDataSourceAdapter
 *
 * Implements BaseDocumentSourceAdapter using the Model Context Protocol (MCP).
 * Retrieva acts as an MCP **client**; the external service runs an MCP **server**
 * that exposes its documents through a standardised set of tools.
 *
 * Required tools the remote MCP server must expose:
 *
 *   get_source_info   → { name, type, totalDocuments, description }
 *   list_documents    → [{ id, title, url, lastModified, type, parentId? }]
 *   fetch_document    → { id, title, url, content, contentHash,
 *                         createdAt, lastModified, author?,
 *                         parentId?, parentType?, properties? }
 *   get_changes       → [{ id, changeType: 'created'|'modified'|'deleted' }]
 *                       (takes argument: { since: ISO-string })
 *
 * Transport: StreamableHTTP (MCP SDK v1.x).
 * Auth:      Bearer token passed as Authorization header.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHash } from 'crypto';
import { BaseDocumentSourceAdapter } from './BaseDocumentSourceAdapter.js';
import logger from '../config/logger.js';

const CONNECT_TIMEOUT_MS = parseInt(process.env.MCP_CONNECT_TIMEOUT_MS) || 15000;
const TOOL_TIMEOUT_MS = parseInt(process.env.MCP_TOOL_TIMEOUT_MS) || 30000;

/**
 * Wrap a promise with a hard timeout.
 */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`MCP operation timed out after ${ms}ms: ${label}`)),
        ms
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export class MCPDataSourceAdapter extends BaseDocumentSourceAdapter {
  /**
   * @param {string} serverUrl  - Full HTTP URL of the MCP server endpoint
   * @param {string} [authToken] - Bearer token for Authorization header (optional)
   * @param {string} [sourceType] - Declared source type label (e.g. 'confluence')
   */
  constructor(serverUrl, authToken = null, sourceType = 'custom') {
    super();
    this.serverUrl = serverUrl;
    this.authToken = authToken;
    this.sourceType = sourceType;
    this._client = null;
    this._connected = false;
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Authenticate and connect to the MCP server.
   * credentials parameter is kept for interface compatibility; the adapter
   * uses the token passed to the constructor.
   */
  async authenticate(_credentials) {
    try {
      const headers = {};
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const transport = new StreamableHTTPClientTransport(new URL(this.serverUrl), { headers });

      this._client = new Client(
        { name: 'retrieva-mcp-client', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );

      await withTimeout(this._client.connect(transport), CONNECT_TIMEOUT_MS, 'connect');
      this._connected = true;

      logger.info('MCPDataSourceAdapter connected', {
        service: 'mcp-adapter',
        serverUrl: this.serverUrl,
        sourceType: this.sourceType,
      });

      return true;
    } catch (error) {
      logger.error('MCPDataSourceAdapter: connection failed', {
        service: 'mcp-adapter',
        serverUrl: this.serverUrl,
        error: error.message,
      });
      throw error;
    }
  }

  async disconnect() {
    if (this._client && this._connected) {
      try {
        await this._client.close();
      } catch (_err) {
        // best-effort
      }
      this._client = null;
      this._connected = false;
    }
  }

  async validateConnection() {
    try {
      await this._callTool('get_source_info', {});
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Core adapter interface
  // ---------------------------------------------------------------------------

  async getWorkspaceInfo() {
    const raw = await this._callTool('get_source_info', {});
    return {
      name: raw?.name ?? 'Unknown MCP Source',
      type: this.sourceType,
      totalDocuments: raw?.totalDocuments ?? 0,
      description: raw?.description ?? '',
    };
  }

  /**
   * Returns an array of lightweight document descriptors.
   * @returns {Promise<Array<{id, title, url, lastModified, type, parentId}>>}
   */
  async listDocuments(options = {}) {
    const raw = await this._callTool('list_documents', options);
    const list = Array.isArray(raw) ? raw : (raw?.documents ?? []);

    return list.map((doc) => ({
      id: String(doc.id),
      title: doc.title ?? 'Untitled',
      url: doc.url ?? null,
      lastModified: doc.lastModified ?? doc.last_modified ?? null,
      type: doc.type ?? 'page',
      parentId: doc.parentId ?? doc.parent_id ?? null,
    }));
  }

  /**
   * Fetch full document content from the MCP server and normalise it into
   * the `documentContent` contract expected by documentIndexWorker.
   *
   * documentContent contract:
   *   { sourceId, title, url, content (markdown), contentHash,
   *     createdAt, lastModified, author, archived,
   *     properties, parentId, parentType }
   *
   * Note: no `blocks` field — the loader falls back to character-based chunking.
   */
  async fetchDocument(documentId) {
    const raw = await this._callTool('fetch_document', { document_id: String(documentId) });

    if (!raw || !raw.id) {
      throw new Error(`MCP server returned invalid document for id=${documentId}`);
    }

    const content = raw.content ?? '';
    const contentHash = raw.contentHash ?? raw.content_hash ?? this._hashContent(content);

    return {
      sourceId: String(raw.id),
      title: raw.title ?? 'Untitled',
      url: raw.url ?? null,
      content,
      contentHash,
      createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
      lastModified: raw.lastModified ?? raw.last_modified ?? new Date().toISOString(),
      author: raw.author ?? null,
      archived: raw.archived ?? false,
      properties: raw.properties ?? {},
      parentId: raw.parentId ?? raw.parent_id ?? null,
      parentType: raw.parentType ?? raw.parent_type ?? null,
    };
  }

  /**
   * Alias used by the sync worker to match the NotionAdapter interface.
   */
  async getDocumentContent(documentId) {
    return this.fetchDocument(documentId);
  }

  /**
   * Transform raw content from the MCP server to plain text / markdown.
   * MCP servers are expected to send markdown already; this is a passthrough.
   */
  async transformToText(rawContent) {
    if (typeof rawContent === 'string') return rawContent;
    return rawContent?.content ?? '';
  }

  /** Extract standardised metadata from an MCP document descriptor. */
  async extractMetadata(doc) {
    return {
      sourceId: String(doc.id),
      title: doc.title ?? 'Untitled',
      url: doc.url ?? null,
      lastModified: doc.lastModified ?? null,
      type: doc.type ?? 'page',
      parentId: doc.parentId ?? null,
    };
  }

  /**
   * Get document IDs that changed since `lastSyncTime`.
   * Falls back to listing all documents if the server does not implement get_changes.
   *
   * @param {Date} lastSyncTime
   * @returns {Promise<Array<{id, changeType}>>}
   */
  async detectChanges(lastSyncTime, _options = {}) {
    try {
      const since = lastSyncTime instanceof Date ? lastSyncTime.toISOString() : lastSyncTime;

      const raw = await this._callTool('get_changes', { since });
      const list = Array.isArray(raw) ? raw : (raw?.changes ?? []);

      return list.map((item) => ({
        id: String(item.id),
        changeType: item.changeType ?? item.change_type ?? 'modified',
      }));
    } catch (error) {
      // Server doesn't implement get_changes — fall back to full re-index
      logger.warn('MCP server does not support get_changes, falling back to full list', {
        service: 'mcp-adapter',
        serverUrl: this.serverUrl,
        error: error.message,
      });

      const docs = await this.listDocuments();
      return docs.map((d) => ({ id: d.id, changeType: 'modified' }));
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Call a named tool on the MCP server and parse its result.
   * The MCP SDK returns { content: [{ type, text }] } for text tools.
   */
  async _callTool(toolName, args) {
    if (!this._connected || !this._client) {
      throw new Error('MCPDataSourceAdapter is not connected. Call authenticate() first.');
    }

    const response = await withTimeout(
      this._client.callTool({ name: toolName, arguments: args }),
      TOOL_TIMEOUT_MS,
      toolName
    );

    // MCP tool results come back as an array of content blocks
    const textBlock = (response?.content ?? []).find((b) => b.type === 'text');
    if (!textBlock) {
      throw new Error(`MCP tool '${toolName}' returned no text content`);
    }

    try {
      return JSON.parse(textBlock.text);
    } catch {
      // If the server returned plain text (e.g. during an error), surface it
      throw new Error(`MCP tool '${toolName}' returned non-JSON response: ${textBlock.text}`);
    }
  }

  _hashContent(content) {
    return createHash('sha256').update(content).digest('hex');
  }
}

export default MCPDataSourceAdapter;
