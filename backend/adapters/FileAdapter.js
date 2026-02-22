/**
 * FileAdapter
 *
 * Converts a file data source into indexable chunks.
 *
 * Fast path (initial sync):
 *   parsedText is already stored in DataSource.config.parsedText by the
 *   controller at upload time — no re-parsing needed.
 *
 * Re-index path (subsequent syncs):
 *   parsedText has been cleared to free MongoDB space. The original file
 *   is fetched from DO Spaces via storageKey, re-parsed, and chunked.
 *   Falls back gracefully when Spaces is not configured (local dev).
 */

import { chunkText, parseFile } from '../services/fileIngestionService.js';
import { downloadFile } from '../services/spacesService.js';
import logger from '../config/logger.js';

export class FileAdapter {
  constructor(dataSource) {
    this.dataSource = dataSource;
    this.fileName = dataSource.config?.fileName || 'unknown';
    this.fileType = dataSource.config?.fileType || 'file';
  }

  /**
   * Return indexable chunk objects for this file.
   * Async because the re-index path fetches from DO Spaces.
   * @returns {Promise<Array<{ content: string, metadata: object }>>}
   */
  async getChunks() {
    let parsedText = this.dataSource.config?.parsedText;

    // Re-index path: parsedText was cleared after the initial sync
    if (!parsedText || parsedText.trim().length < 10) {
      const { storageKey } = this.dataSource;

      if (!storageKey) {
        logger.warn('FileAdapter: no parsedText and no storageKey — cannot index', {
          service: 'file-adapter',
          dataSourceId: this.dataSource._id,
          fileName: this.fileName,
        });
        return [];
      }

      logger.info('FileAdapter: parsedText gone — re-fetching from Spaces', {
        service: 'file-adapter',
        dataSourceId: this.dataSource._id,
        storageKey,
      });

      const buffer = await downloadFile(storageKey);
      parsedText = await parseFile(buffer, this.fileType);

      if (!parsedText || parsedText.trim().length < 10) {
        logger.warn('FileAdapter: re-parse from Spaces yielded no text', {
          service: 'file-adapter',
          dataSourceId: this.dataSource._id,
        });
        return [];
      }
    }

    const chunks = chunkText(parsedText);

    return chunks.map((content, index) => ({
      content,
      metadata: {
        fileName: this.fileName,
        fileType: this.fileType,
        sourceType: 'file',
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    }));
  }

  /**
   * Remove parsedText from config to free MongoDB space after indexing.
   * The original file remains safely in DO Spaces for future re-indexing.
   */
  async clearParsedText() {
    if (this.dataSource.config) {
      this.dataSource.config = {
        ...this.dataSource.config,
        parsedText: undefined,
      };
      this.dataSource.markModified('config');
      await this.dataSource.save();
      logger.debug('FileAdapter: parsedText cleared', {
        service: 'file-adapter',
        dataSourceId: this.dataSource._id,
        storageKey: this.dataSource.storageKey || 'none',
      });
    }
  }
}

export default FileAdapter;
