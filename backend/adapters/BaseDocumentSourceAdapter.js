/**
 * Base abstract class for document source adapters
 * Provides a common interface for integrating different document sources
 * (Notion, Google Drive, Confluence, etc.)
 */
export class BaseDocumentSourceAdapter {
  constructor() {
    if (new.target === BaseDocumentSourceAdapter) {
      throw new TypeError('Cannot construct BaseDocumentSourceAdapter instances directly');
    }
  }

  /**
   * Authenticate with the document source
   * @param {Object} credentials - Authentication credentials (access token, API key, etc.)
   * @returns {Promise<boolean>} Success status
   */
  async authenticate(_credentials) {
    throw new Error('Method authenticate() must be implemented');
  }

  /**
   * List all available documents from the source
   * @param {Object} options - Optional filters (folder, type, etc.)
   * @returns {Promise<Array>} Array of document metadata objects
   */
  async listDocuments(_options = {}) {
    throw new Error('Method listDocuments() must be implemented');
  }

  /**
   * Fetch content of a single document
   * @param {string} documentId - Unique identifier of the document
   * @returns {Promise<Object>} Document object with content and metadata
   */
  async fetchDocument(_documentId) {
    throw new Error('Method fetchDocument() must be implemented');
  }

  /**
   * Transform raw document content to plain text or markdown
   * @param {Object} rawContent - Raw content from the source
   * @returns {Promise<string>} Transformed text content
   */
  async transformToText(_rawContent) {
    throw new Error('Method transformToText() must be implemented');
  }

  /**
   * Extract standardized metadata from document
   * @param {Object} document - Document object from source
   * @returns {Promise<Object>} Standardized metadata object
   */
  async extractMetadata(_document) {
    throw new Error('Method extractMetadata() must be implemented');
  }

  /**
   * Detect documents that have changed since last sync
   * @param {Date} lastSyncTime - Timestamp of last successful sync
   * @param {Object} options - Optional filters
   * @returns {Promise<Array>} Array of changed document IDs
   */
  async detectChanges(lastSyncTime, _options = {}) {
    throw new Error('Method detectChanges() must be implemented');
  }

  /**
   * Disconnect from the document source and cleanup resources
   * @returns {Promise<void>}
   */
  async disconnect() {
    // Optional implementation
    return Promise.resolve();
  }

  /**
   * Validate connection to the document source
   * @returns {Promise<boolean>} Connection validity status
   */
  async validateConnection() {
    throw new Error('Method validateConnection() must be implemented');
  }

  /**
   * Get workspace/account information
   * @returns {Promise<Object>} Workspace info
   */
  async getWorkspaceInfo() {
    throw new Error('Method getWorkspaceInfo() must be implemented');
  }
}

export default BaseDocumentSourceAdapter;
