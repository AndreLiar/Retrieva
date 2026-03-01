/**
 * DigitalOcean Spaces (S3-compatible) Storage
 *
 * Provides upload / download / delete helpers for persistent file storage.
 * All keys are prefixed with organizations/{orgId}/... to enforce org-level isolation.
 *
 * Gracefully no-ops when Spaces env vars are not configured.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import logger from './logger.js';

const {
  DO_SPACES_KEY,
  DO_SPACES_SECRET,
  DO_SPACES_ENDPOINT,
  DO_SPACES_BUCKET,
  DO_SPACES_REGION = 'fra1',
} = process.env;

/**
 * Returns true when all required Spaces env vars are present.
 */
export function isStorageConfigured() {
  return !!(DO_SPACES_KEY && DO_SPACES_SECRET && DO_SPACES_ENDPOINT && DO_SPACES_BUCKET);
}

const s3 = isStorageConfigured()
  ? new S3Client({
      endpoint: DO_SPACES_ENDPOINT,
      region: DO_SPACES_REGION,
      credentials: {
        accessKeyId: DO_SPACES_KEY,
        secretAccessKey: DO_SPACES_SECRET,
      },
    })
  : null;

/**
 * Build the Spaces object key for a data source file.
 * organizations/{orgId}/workspaces/{wsId}/datasources/{dsId}/{fileName}
 */
export function buildDataSourceKey(orgId, workspaceId, dataSourceId, fileName) {
  return `organizations/${orgId}/workspaces/${workspaceId}/datasources/${dataSourceId}/${fileName}`;
}

/**
 * Build the Spaces object key for an assessment document.
 * organizations/{orgId}/workspaces/{wsId}/assessments/{assessmentId}/{index}_{fileName}
 */
export function buildAssessmentFileKey(orgId, workspaceId, assessmentId, docIndex, fileName) {
  return `organizations/${orgId}/workspaces/${workspaceId}/assessments/${assessmentId}/${docIndex}_${fileName}`;
}

/**
 * Upload a buffer to Spaces.
 * @param {string} key - Object key (path in bucket)
 * @param {Buffer} buffer - File contents
 * @param {string} mimeType - Content-Type header
 * @returns {Promise<string>} The key that was uploaded
 * @throws {Error} If storage is not configured or upload fails
 */
export async function uploadFile(key, buffer, mimeType = 'application/octet-stream') {
  if (!s3) throw new Error('Storage not configured');
  await s3.send(
    new PutObjectCommand({
      Bucket: DO_SPACES_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ACL: 'private',
    })
  );
  logger.info('File uploaded to Spaces', { key });
  return key;
}

/**
 * Download a file from Spaces as a readable stream.
 * Pipe the returned stream directly to an Express response.
 * @param {string} key - Object key
 * @returns {Promise<import('stream').Readable>} Node.js readable stream
 * @throws {Error} If storage is not configured or object not found
 */
export async function downloadFileStream(key) {
  if (!s3) throw new Error('Storage not configured');
  const response = await s3.send(new GetObjectCommand({ Bucket: DO_SPACES_BUCKET, Key: key }));
  return response.Body;
}

/**
 * Delete a file from Spaces. No-op if storage is not configured.
 * @param {string} key - Object key
 */
export async function deleteFile(key) {
  if (!s3) return;
  await s3.send(new DeleteObjectCommand({ Bucket: DO_SPACES_BUCKET, Key: key }));
  logger.info('File deleted from Spaces', { key });
}
