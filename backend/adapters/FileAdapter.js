/**
 * FileAdapter
 *
 * Wraps already-parsed text stored in DataSource.config.parsedText into
 * chunks ready for the documentIndexQueue. Text is parsed synchronously
 * by the controller at upload time and stored in config.parsedText so the
 * worker does not need to re-parse the original buffer.
 */

import { chunkText } from '../services/fileIngestionService.js';
import logger from '../config/logger.js';

export class FileAdapter {
  constructor(dataSource) {
    this.dataSource = dataSource;
    this.fileName = dataSource.config?.fileName || 'unknown';
    this.fileType = dataSource.config?.fileType || 'file';
  }

  /**
   * Convert the stored parsedText into chunk objects.
   * @returns {Array<{ content: string, metadata: object }>}
   */
  getChunks() {
    const parsedText = this.dataSource.config?.parsedText;

    if (!parsedText || parsedText.trim().length < 10) {
      logger.warn('FileAdapter: no parsedText available', {
        service: 'file-adapter',
        dataSourceId: this.dataSource._id,
        fileName: this.fileName,
      });
      return [];
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
   */
  async clearParsedText() {
    if (this.dataSource.config) {
      this.dataSource.config = {
        ...this.dataSource.config,
        parsedText: undefined,
      };
      // Use markModified so Mongoose detects the Mixed field change
      this.dataSource.markModified('config');
      await this.dataSource.save();
      logger.debug('FileAdapter: parsedText cleared', {
        service: 'file-adapter',
        dataSourceId: this.dataSource._id,
      });
    }
  }
}

export default FileAdapter;
