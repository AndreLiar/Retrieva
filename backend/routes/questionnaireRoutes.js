import { Router } from 'express';
import {
  createQuestionnaire,
  listQuestionnaires,
  getQuestionnaire,
  deleteQuestionnaire,
  sendQuestionnaire,
} from '../controllers/questionnaireController.js';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspaceAccess } from '../middleware/workspaceAuth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createQuestionnaireSchema,
  sendQuestionnaireSchema,
  idParamsSchema,
  listQuestionnairesQuerySchema,
} from '../validators/schemas.js';

const router = Router();

// ---------------------------------------------------------------------------
// Authenticated routes — require JWT + workspace membership
// Public /respond/:token routes live in questionnairePublicRoutes.js, mounted
// unguarded in app.js (ahead of requireActivePlan).
// ---------------------------------------------------------------------------

/**
 * @route  POST /api/v1/questionnaires
 * @desc   Create a new vendor questionnaire from the default DORA template
 * @access Private
 */
router.post(
  '/',
  authenticate,
  requireWorkspaceAccess,
  validateBody(createQuestionnaireSchema),
  createQuestionnaire
);

/**
 * @route  GET /api/v1/questionnaires
 * @desc   List questionnaires (scoped to user's workspaces)
 * @access Private
 */
router.get(
  '/',
  authenticate,
  requireWorkspaceAccess,
  validateQuery(listQuestionnairesQuerySchema),
  listQuestionnaires
);

/**
 * @route  GET /api/v1/questionnaires/:id
 * @desc   Get a single questionnaire with full results and answers
 * @access Private
 */
router.get(
  '/:id',
  authenticate,
  requireWorkspaceAccess,
  validateParams(idParamsSchema),
  getQuestionnaire
);

/**
 * @route  POST /api/v1/questionnaires/:id/send
 * @desc   Generate token and email questionnaire invitation to vendor
 * @access Private
 */
router.post(
  '/:id/send',
  authenticate,
  requireWorkspaceAccess,
  validateParams(idParamsSchema),
  validateBody(sendQuestionnaireSchema),
  sendQuestionnaire
);

/**
 * @route  DELETE /api/v1/questionnaires/:id
 * @desc   Delete a questionnaire (creator only)
 * @access Private
 */
router.delete(
  '/:id',
  authenticate,
  requireWorkspaceAccess,
  validateParams(idParamsSchema),
  deleteQuestionnaire
);

export default router;
