/**
 * DataSource Routes
 *
 * /api/v1/data-sources
 *
 * Handles file upload (multipart), URL, and Confluence data sources.
 * All routes require authentication + workspace membership.
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspaceAccess } from '../middleware/workspaceAuth.js';
import {
  create,
  list,
  getOne,
  triggerSync,
  deleteSource,
  downloadDataSourceFile,
} from '../controllers/dataSourceController.js';

const router = Router();

// Memory storage — buffer passed to controller for parsing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// All routes require auth + workspace membership
router.use(authenticate, requireWorkspaceAccess);

/**
 * @route  POST /api/v1/data-sources
 * @desc   Create a data source (multipart for file, JSON for url/confluence)
 * @access Private
 */
router.post('/', upload.single('file'), create);

/**
 * @route  GET /api/v1/data-sources?workspaceId=...
 * @desc   List data sources for a workspace
 * @access Private
 */
router.get('/', list);

/**
 * @route  GET /api/v1/data-sources/:id
 * @desc   Get a single data source
 * @access Private
 */
router.get('/:id', getOne);

/**
 * @route  POST /api/v1/data-sources/:id/sync
 * @desc   Trigger a manual sync for a data source
 * @access Private
 */
router.post('/:id/sync', triggerSync);

/**
 * @route  DELETE /api/v1/data-sources/:id
 * @desc   Delete a data source and soft-delete its documents
 * @access Private
 */
router.delete('/:id', deleteSource);

/**
 * @route  GET /api/v1/data-sources/:id/download
 * @desc   Download the original uploaded file from DigitalOcean Spaces
 * @access Private
 */
router.get('/:id/download', downloadDataSourceFile);

export default router;
