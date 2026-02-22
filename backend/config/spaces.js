/**
 * DigitalOcean Spaces client (S3-compatible).
 *
 * Spaces is used to store original uploaded files so they can be
 * re-fetched for re-indexing without requiring the user to re-upload.
 *
 * Required env vars:
 *   DO_SPACES_KEY      — Spaces access key ID
 *   DO_SPACES_SECRET   — Spaces secret access key
 *   DO_SPACES_ENDPOINT — e.g. https://fra1.digitaloceanspaces.com
 *   DO_SPACES_BUCKET   — bucket name, e.g. retrieva-files
 *   DO_SPACES_REGION   — region slug, e.g. fra1 (default: fra1)
 *
 * If DO_SPACES_KEY or DO_SPACES_SECRET are not set, `spacesEnabled`
 * will be false and uploads are skipped silently (safe for local dev).
 */

import { S3Client } from '@aws-sdk/client-s3';

const {
  DO_SPACES_KEY,
  DO_SPACES_SECRET,
  DO_SPACES_ENDPOINT,
  DO_SPACES_REGION = 'fra1',
  DO_SPACES_BUCKET = 'retrieva-files',
  // Set to 'true' when using MinIO locally (path-style: endpoint/bucket/key)
  // Leave unset or 'false' for DO Spaces in production (virtual-hosted style)
  DO_SPACES_FORCE_PATH_STYLE = 'false',
} = process.env;

export const spacesEnabled = !!(DO_SPACES_KEY && DO_SPACES_SECRET && DO_SPACES_ENDPOINT);

export const SPACES_BUCKET = DO_SPACES_BUCKET;

export const spacesClient = spacesEnabled
  ? new S3Client({
      endpoint: DO_SPACES_ENDPOINT,
      region: DO_SPACES_REGION,
      credentials: {
        accessKeyId: DO_SPACES_KEY,
        secretAccessKey: DO_SPACES_SECRET,
      },
      forcePathStyle: DO_SPACES_FORCE_PATH_STYLE === 'true',
    })
  : null;
