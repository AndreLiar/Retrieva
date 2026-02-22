/**
 * DataSource Controller
 *
 * CRUD + sync trigger for file, URL, and Confluence data sources.
 * File uploads use multer memory storage (same pattern as assessmentController).
 */

import path from 'path';
import { DataSource } from '../models/DataSource.js';
import { DocumentSource } from '../models/DocumentSource.js';
import { dataSourceSyncQueue } from '../config/queue.js';
import { catchAsync, sendSuccess, sendError, AppError } from '../utils/index.js';
import logger from '../config/logger.js';
import { uploadFile, deleteFile, buildStorageKey } from '../services/spacesService.js';

const MAX_FILE_SIZE_MB = 25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive fileType string from original filename extension.
 */
function fileTypeFromName(originalname) {
  return path.extname(originalname).replace('.', '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/data-sources
 * Supports multipart (file upload) or JSON (url/confluence).
 */
export const create = catchAsync(async (req, res) => {
  const workspaceId = req.body.workspaceId || req.query.workspaceId;
  if (!workspaceId) {
    return sendError(res, 400, 'workspaceId is required');
  }

  const { name, sourceType, config: rawConfig } = req.body;

  if (!name || !name.trim()) {
    return sendError(res, 400, 'name is required');
  }
  if (!sourceType || !['file', 'url', 'confluence'].includes(sourceType)) {
    return sendError(res, 400, 'sourceType must be one of: file, url, confluence');
  }

  // Parse JSON config if sent as a string (multipart forms stringify objects)
  let configInput = rawConfig;
  if (typeof rawConfig === 'string') {
    try {
      configInput = JSON.parse(rawConfig);
    } catch {
      configInput = {};
    }
  }

  let config = {};
  let apiToken;

  if (sourceType === 'file') {
    if (!req.file) {
      return sendError(res, 400, 'A file must be uploaded for sourceType=file');
    }

    const fileSizeBytes = req.file.size;
    if (fileSizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return sendError(res, 400, `File too large. Max size is ${MAX_FILE_SIZE_MB}MB`);
    }

    const fileType = fileTypeFromName(req.file.originalname);
    const allowedTypes = ['pdf', 'xlsx', 'xls', 'docx'];
    if (!allowedTypes.includes(fileType)) {
      return sendError(
        res,
        400,
        `Unsupported file type: .${fileType}. Allowed: pdf, xlsx, xls, docx`
      );
    }

    // Parse file text synchronously in controller so worker only needs to chunk it
    // Dynamic import avoids interfering with Vitest mock system for fileIngestionService
    const { parseFile } = await import('../services/fileIngestionService.js');
    const parsedText = await parseFile(req.file.buffer, fileType);
    if (!parsedText || parsedText.trim().length < 10) {
      return sendError(
        res,
        400,
        'Could not extract text from the uploaded file. It may be empty or image-only.'
      );
    }

    config = {
      fileName: req.file.originalname,
      fileType,
      fileSize: fileSizeBytes,
      parsedText,
    };
  } else if (sourceType === 'url') {
    const url = configInput?.url || req.body.url;
    if (!url || !url.startsWith('http')) {
      return sendError(res, 400, 'A valid URL is required for sourceType=url');
    }
    config = { url };
  } else if (sourceType === 'confluence') {
    const { baseUrl, spaceKey, email } = configInput || {};
    apiToken = configInput?.apiToken || req.body.apiToken;

    if (!baseUrl || !spaceKey || !email || !apiToken) {
      return sendError(
        res,
        400,
        'baseUrl, spaceKey, email, and apiToken are required for Confluence'
      );
    }
    config = { baseUrl, spaceKey, email };
  }

  const dataSource = await DataSource.create({
    workspaceId,
    name: name.trim(),
    sourceType,
    config,
    ...(apiToken ? { apiToken } : {}),
    status: 'pending',
  });

  // Upload original file buffer to DO Spaces for re-indexing capability
  if (sourceType === 'file' && req.file?.buffer) {
    const key = buildStorageKey({
      workspaceId,
      dataSourceId: dataSource._id.toString(),
      fileName: req.file.originalname,
    });
    const contentType = req.file.mimetype || 'application/octet-stream';
    const storageKey = await uploadFile({ key, buffer: req.file.buffer, contentType });
    if (storageKey) {
      dataSource.storageKey = storageKey;
      await dataSource.save();
    }
  }

  // Enqueue initial sync immediately
  await dataSourceSyncQueue.add(
    'syncDataSource',
    { dataSourceId: dataSource._id.toString(), workspaceId, sourceType },
    { jobId: `ds-sync-${dataSource._id}` }
  );

  logger.info('DataSource created', {
    service: 'datasource-controller',
    dataSourceId: dataSource._id,
    workspaceId,
    sourceType,
  });

  // Return without parsedText (could be large)
  const responseDoc = dataSource.toObject();
  if (responseDoc.config?.parsedText) {
    delete responseDoc.config.parsedText;
  }

  sendSuccess(res, 201, 'Data source created and queued for sync', { dataSource: responseDoc });
});

/**
 * GET /api/v1/data-sources?workspaceId=...
 */
export const list = catchAsync(async (req, res) => {
  const workspaceId = req.query.workspaceId;
  if (!workspaceId) {
    return sendError(res, 400, 'workspaceId query parameter is required');
  }

  const dataSources = await DataSource.find({ workspaceId }).sort({ createdAt: -1 }).lean();

  // Strip parsedText from response
  const sanitized = dataSources.map((ds) => {
    if (ds.config?.parsedText) {
      const { parsedText, ...rest } = ds.config;
      void parsedText;
      return { ...ds, config: rest };
    }
    return ds;
  });

  sendSuccess(res, 200, 'Data sources retrieved', { dataSources: sanitized });
});

/**
 * GET /api/v1/data-sources/:id
 */
export const getOne = catchAsync(async (req, res) => {
  const dataSource = await DataSource.findById(req.params.id).lean();
  if (!dataSource) {
    throw new AppError('Data source not found', 404);
  }

  // Workspace ownership check
  const authorizedIds = (req.authorizedWorkspaces || []).flatMap((w) => [
    (w.workspaceId || '').toString(),
    (w._id || '').toString(),
  ]);
  if (!authorizedIds.includes(dataSource.workspaceId)) {
    throw new AppError('Access denied to this data source', 403);
  }

  if (dataSource.config?.parsedText) {
    const { parsedText, ...rest } = dataSource.config;
    void parsedText;
    dataSource.config = rest;
  }

  sendSuccess(res, 200, 'Data source retrieved', { dataSource });
});

/**
 * POST /api/v1/data-sources/:id/sync
 */
export const triggerSync = catchAsync(async (req, res) => {
  const dataSource = await DataSource.findById(req.params.id);
  if (!dataSource) {
    throw new AppError('Data source not found', 404);
  }

  const authorizedIds = (req.authorizedWorkspaces || []).flatMap((w) => [
    (w.workspaceId || '').toString(),
    (w._id || '').toString(),
  ]);
  if (!authorizedIds.includes(dataSource.workspaceId)) {
    throw new AppError('Access denied to this data source', 403);
  }

  if (dataSource.status === 'syncing') {
    return sendError(res, 409, 'Sync already in progress for this data source');
  }

  const job = await dataSourceSyncQueue.add(
    'syncDataSource',
    {
      dataSourceId: dataSource._id.toString(),
      workspaceId: dataSource.workspaceId,
      sourceType: dataSource.sourceType,
    },
    { jobId: `ds-sync-${dataSource._id}-${Date.now()}` }
  );

  logger.info('DataSource sync triggered', {
    service: 'datasource-controller',
    dataSourceId: dataSource._id,
    jobId: job.id,
  });

  sendSuccess(res, 200, 'Sync job enqueued', { jobId: job.id });
});

/**
 * DELETE /api/v1/data-sources/:id
 */
export const deleteSource = catchAsync(async (req, res) => {
  const dataSource = await DataSource.findById(req.params.id);
  if (!dataSource) {
    throw new AppError('Data source not found', 404);
  }

  const authorizedIds = (req.authorizedWorkspaces || []).flatMap((w) => [
    (w.workspaceId || '').toString(),
    (w._id || '').toString(),
  ]);
  if (!authorizedIds.includes(dataSource.workspaceId)) {
    throw new AppError('Access denied to this data source', 403);
  }

  // Soft-delete related DocumentSource records (they will be cleaned from Qdrant on next index pass)
  const dsIdStr = dataSource._id.toString();
  await DocumentSource.updateMany(
    {
      workspaceId: dataSource.workspaceId,
      sourceType: dataSource.sourceType,
      'metadata.properties.dataSourceId': dsIdStr,
    },
    { syncStatus: 'deleted' }
  );

  // Delete original file from DO Spaces (non-blocking — errors are logged, not thrown)
  await deleteFile(dataSource.storageKey);

  await DataSource.findByIdAndDelete(req.params.id);

  logger.info('DataSource deleted', {
    service: 'datasource-controller',
    dataSourceId: dsIdStr,
    workspaceId: dataSource.workspaceId,
  });

  sendSuccess(res, 200, 'Data source deleted');
});
