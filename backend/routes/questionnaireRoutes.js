import { Router } from 'express';
import {
  createQuestionnaire,
  listQuestionnaires,
  getQuestionnaire,
  deleteQuestionnaire,
  sendQuestionnaire,
  getPublicForm,
  submitResponse,
} from '../controllers/questionnaireController.js';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspaceAccess } from '../middleware/workspaceAuth.js';

const router = Router();

// ---------------------------------------------------------------------------
// Public routes — no authentication required (token-based access only)
// ---------------------------------------------------------------------------

/**
 * @route  GET /api/v1/questionnaires/respond/:token
 * @desc   Load the public vendor questionnaire form
 * @access Public (token-gated)
 */
router.get('/respond/:token', getPublicForm);

/**
 * @route  POST /api/v1/questionnaires/respond/:token
 * @desc   Save partial or final vendor response
 * @access Public (token-gated)
 */
router.post('/respond/:token', submitResponse);

// ---------------------------------------------------------------------------
// Authenticated routes — require JWT + workspace membership
// ---------------------------------------------------------------------------

/**
 * @route  POST /api/v1/questionnaires
 * @desc   Create a new vendor questionnaire from the default DORA template
 * @access Private
 */
router.post('/', authenticate, requireWorkspaceAccess, createQuestionnaire);

/**
 * @route  GET /api/v1/questionnaires
 * @desc   List questionnaires (scoped to user's workspaces)
 * @access Private
 */
router.get('/', authenticate, requireWorkspaceAccess, listQuestionnaires);

/**
 * @route  GET /api/v1/questionnaires/:id
 * @desc   Get a single questionnaire with full results and answers
 * @access Private
 */
router.get('/:id', authenticate, requireWorkspaceAccess, getQuestionnaire);

/**
 * @route  POST /api/v1/questionnaires/:id/send
 * @desc   Generate token and email questionnaire invitation to vendor
 * @access Private
 */
router.post('/:id/send', authenticate, requireWorkspaceAccess, sendQuestionnaire);

/**
 * @route  DELETE /api/v1/questionnaires/:id
 * @desc   Delete a questionnaire (creator only)
 * @access Private
 */
router.delete('/:id', authenticate, requireWorkspaceAccess, deleteQuestionnaire);

export default router;
