/**
 * UrlCrawlerAdapter
 *
 * Fetches a URL, strips HTML to plain text, and returns text chunks.
 * Uses axios (already installed) — no new dependencies.
 */

import axios from 'axios';
import { chunkText } from '../services/fileIngestionService.js';
import logger from '../config/logger.js';

const FETCH_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Strip HTML tags and normalise whitespace to produce readable plain text.
 */
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export class UrlCrawlerAdapter {
  constructor(dataSource) {
    this.url = dataSource.config?.url;
    this.dataSourceId = dataSource._id;
  }

  /**
   * Fetch the URL and return plain text.
   * @returns {Promise<string>}
   */
  async fetchText() {
    if (!this.url) {
      throw new Error('UrlCrawlerAdapter: no URL configured');
    }

    logger.info('UrlCrawlerAdapter: fetching URL', {
      service: 'url-crawler',
      url: this.url,
      dataSourceId: this.dataSourceId,
    });

    const response = await axios.get(this.url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Retrieva-Crawler/1.0 (RAG knowledge base indexer)',
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
      maxRedirects: 5,
      // Treat all 2xx as success; non-2xx will throw automatically
    });

    const contentType = response.headers?.['content-type'] || '';
    let text;

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      text = stripHtml(String(response.data));
    } else {
      // Plain text, JSON, etc.
      text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    }

    return text;
  }

  /**
   * Split plain text into chunk objects.
   * @param {string} text
   * @returns {Array<{ content: string, metadata: object }>}
   */
  getChunks(text) {
    const chunks = chunkText(text);
    return chunks.map((content, index) => ({
      content,
      metadata: {
        url: this.url,
        sourceType: 'url',
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    }));
  }
}

export default UrlCrawlerAdapter;
