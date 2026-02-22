import { Router } from 'express';
import {
  createAssessment,
  listAssessments,
  getAssessment,
  downloadReport,
  deleteAssessment,
} from '../controllers/assessmentController.js';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspaceAccess } from '../middleware/workspaceAuth.js';

const router = Router();

/**
 * All assessment routes require authentication and workspace membership.
 * File upload (multipart) is handled inside the controller via handleFileUpload().
 */

/**
 * @route  POST /api/v1/assessments
 * @desc   Create a new DORA compliance assessment (multipart/form-data)
 * @access Private
 */
router.post('/', authenticate, requireWorkspaceAccess, createAssessment);

/**
 * @route  GET /api/v1/assessments
 * @desc   List assessments (scoped to user's workspaces)
 * @access Private
 */
router.get('/', authenticate, requireWorkspaceAccess, listAssessments);

/**
 * @route  GET /api/v1/assessments/:id
 * @desc   Get a single assessment with full results
 * @access Private
 */
router.get('/:id', authenticate, requireWorkspaceAccess, getAssessment);

/**
 * @route  GET /api/v1/assessments/:id/report
 * @desc   Download DORA compliance report as .docx
 * @access Private
 */
router.get('/:id/report', authenticate, requireWorkspaceAccess, downloadReport);

/**
 * @route  DELETE /api/v1/assessments/:id
 * @desc   Delete an assessment and its Qdrant collection
 * @access Private (creator only)
 */
router.delete('/:id', authenticate, requireWorkspaceAccess, deleteAssessment);

export default router;
