/**
 * spacesService
 *
 * Thin wrapper around @aws-sdk/client-s3 for DigitalOcean Spaces operations.
 * All functions degrade gracefully when Spaces is not configured (local dev).
 *
 * Storage layout:
 *   workspaces/{workspaceId}/datasources/{dataSourceId}/{sanitizedFileName}
 */

import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { spacesClient, SPACES_BUCKET, spacesEnabled } from '../config/spaces.js';
import logger from '../config/logger.js';

// ---------------------------------------------------------------------------
// Key builder
// ---------------------------------------------------------------------------

/**
 * Build a deterministic, safe storage key for a DataSource file.
 * Non-alphanumeric characters (except . _ -) are replaced with underscores.
 */
export function buildStorageKey({ workspaceId, dataSourceId, fileName }) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `workspaces/${workspaceId}/datasources/${dataSourceId}/${safe}`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a file buffer to DO Spaces.
 * @returns {string|null} The storage key, or null if Spaces is not configured.
 */
export async function uploadFile({ key, buffer, contentType = 'application/octet-stream' }) {
  if (!spacesEnabled) {
    logger.debug('spacesService: Spaces not configured — file backup skipped', { key });
    return null;
  }

  await spacesClient.send(
    new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'private',
    })
  );

  logger.info('spacesService: file uploaded', { key, bucket: SPACES_BUCKET });
  return key;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Download a file from DO Spaces and return its content as a Buffer.
 * @throws {Error} If Spaces is not configured or the object cannot be fetched.
 */
export async function downloadFile(key) {
  if (!spacesEnabled) {
    throw new Error('Spaces is not configured — cannot fetch file for re-indexing');
  }

  const response = await spacesClient.send(
    new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: key })
  );

  // Convert the readable stream (Body) into a Buffer
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a file from DO Spaces. Errors are logged but never thrown
 * so a failed cleanup never blocks the caller.
 */
export async function deleteFile(key) {
  if (!spacesEnabled || !key) return;

  try {
    await spacesClient.send(new DeleteObjectCommand({ Bucket: SPACES_BUCKET, Key: key }));
    logger.info('spacesService: file deleted', { key });
  } catch (err) {
    logger.warn('spacesService: failed to delete file', { key, error: err.message });
  }
}
