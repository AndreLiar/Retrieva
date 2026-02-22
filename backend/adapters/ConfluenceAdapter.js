/**
 * ConfluenceAdapter
 *
 * Connects to Confluence Cloud REST API v1 (content endpoint) to list pages
 * in a space and fetch their storage-format body, then converts to plain text.
 *
 * Auth: HTTP Basic (email:apiToken) as required by Confluence Cloud.
 */

import axios from 'axios';
import { chunkText } from '../services/fileIngestionService.js';
import logger from '../config/logger.js';

const REQUEST_TIMEOUT_MS = 15000;
const PAGE_LIMIT = 50;

/**
 * Strip Confluence storage XML to plain text.
 */
function stripConfluenceXml(storageXml) {
  if (!storageXml) return '';
  return storageXml
    .replace(/<ac:[^>]+>[\s\S]*?<\/ac:[^>]+>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export class ConfluenceAdapter {
  constructor(dataSource) {
    const { baseUrl, spaceKey, email } = dataSource.config || {};
    const apiToken = dataSource.get('apiToken');

    if (!baseUrl || !spaceKey || !email || !apiToken) {
      throw new Error(
        'ConfluenceAdapter: missing required config (baseUrl, spaceKey, email, apiToken)'
      );
    }

    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.spaceKey = spaceKey;
    this.dataSourceId = dataSource._id;

    // Confluence Cloud uses Basic auth: email:apiToken base64 encoded
    this.authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  }

  _client() {
    return axios.create({
      baseURL: `${this.baseUrl}/wiki/rest/api`,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
      },
    });
  }

  /**
   * List all pages in the configured space.
   * @returns {Promise<Array<{ id: string, title: string }>>}
   */
  async listPages() {
    const client = this._client();
    const pages = [];
    let start = 0;

    while (true) {
      const response = await client.get('/content', {
        params: {
          spaceKey: this.spaceKey,
          type: 'page',
          status: 'current',
          limit: PAGE_LIMIT,
          start,
        },
      });

      const results = response.data?.results || [];
      pages.push(...results.map((p) => ({ id: p.id, title: p.title })));

      if (results.length < PAGE_LIMIT) break;
      start += PAGE_LIMIT;
    }

    logger.info('ConfluenceAdapter: pages listed', {
      service: 'confluence-adapter',
      dataSourceId: this.dataSourceId,
      spaceKey: this.spaceKey,
      pageCount: pages.length,
    });

    return pages;
  }

  /**
   * Fetch the full content of a page.
   * @param {string} pageId
   * @returns {Promise<string>} Plain text of page
   */
  async fetchPageText(pageId) {
    const client = this._client();
    const response = await client.get(`/content/${pageId}`, {
      params: { expand: 'body.storage' },
    });

    const storageXml = response.data?.body?.storage?.value || '';
    return stripConfluenceXml(storageXml);
  }

  /**
   * Convert page text into chunk objects.
   * @param {string} pageText
   * @param {{ id: string, title: string }} meta
   * @returns {Array<{ content: string, metadata: object }>}
   */
  getChunks(pageText, meta) {
    const chunks = chunkText(pageText);
    return chunks.map((content, index) => ({
      content,
      metadata: {
        pageId: meta.id,
        title: meta.title,
        spaceKey: this.spaceKey,
        sourceType: 'confluence',
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    }));
  }
}

export default ConfluenceAdapter;
