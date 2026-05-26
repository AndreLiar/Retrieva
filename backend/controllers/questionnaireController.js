import { questionnaireService } from '../services/QuestionnaireService.js';
import { catchAsync, sendSuccess } from '../utils/index.js';

/**
 * POST /api/v1/questionnaires
 */
export const createQuestionnaire = catchAsync(async (req, res) => {
  const { vendorName, vendorEmail, vendorContactName, workspaceId } = req.body;

  const questionnaire = await questionnaireService.createQuestionnaire({
    vendorName,
    vendorEmail,
    vendorContactName,
    workspaceId,
    userId: req.user.userId,
  });

  sendSuccess(res, 201, 'Questionnaire created', {
    questionnaire: {
      _id: questionnaire._id,
      workspaceId: questionnaire.workspaceId,
      vendorName: questionnaire.vendorName,
      vendorEmail: questionnaire.vendorEmail,
      vendorContactName: questionnaire.vendorContactName,
      status: questionnaire.status,
      questions: questionnaire.questions.map((q) => ({
        id: q.id,
        text: q.text,
        doraArticle: q.doraArticle,
        category: q.category,
      })),
      createdAt: questionnaire.createdAt,
    },
  });
});

/**
 * GET /api/v1/questionnaires
 */
export const listQuestionnaires = catchAsync(async (req, res) => {
  const { workspaceId, status, page = 1, limit = 20 } = req.query;
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id) || [];

  const result = await questionnaireService.listQuestionnaires({
    authorizedWorkspaceIds,
    workspaceId,
    status,
    page,
    limit,
  });

  sendSuccess(res, 200, 'Questionnaires retrieved', result);
});

/**
 * GET /api/v1/questionnaires/:id
 */
export const getQuestionnaire = catchAsync(async (req, res) => {
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id.toString()) || [];

  const questionnaire = await questionnaireService.getQuestionnaire(
    req.params.id,
    authorizedWorkspaceIds
  );

  sendSuccess(res, 200, 'Questionnaire retrieved', { questionnaire });
});

/**
 * DELETE /api/v1/questionnaires/:id
 */
export const deleteQuestionnaire = catchAsync(async (req, res) => {
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id.toString()) || [];

  await questionnaireService.deleteQuestionnaire(
    req.params.id,
    req.user.userId,
    authorizedWorkspaceIds
  );

  sendSuccess(res, 200, 'Questionnaire deleted');
});

/**
 * POST /api/v1/questionnaires/:id/send
 */
export const sendQuestionnaire = catchAsync(async (req, res) => {
  const questionnaire = await questionnaireService.sendQuestionnaire(
    req.params.id,
    { userId: req.user.userId, userName: req.user.name, userEmail: req.user.email },
    req.authorizedWorkspaces || []
  );

  sendSuccess(res, 200, 'Questionnaire invitation sent', {
    questionnaire: {
      _id: questionnaire._id,
      status: questionnaire.status,
      sentAt: questionnaire.sentAt,
      tokenExpiresAt: questionnaire.tokenExpiresAt,
    },
  });
});

/**
 * GET /api/v1/questionnaires/respond/:token  (PUBLIC — no auth)
 */
export const getPublicForm = catchAsync(async (req, res) => {
  const result = await questionnaireService.getPublicForm(req.params.token);

  if (result.state === 'complete') {
    return res.status(200).json({
      success: true,
      alreadyComplete: true,
      message: 'Your response has already been received. Thank you.',
    });
  }

  if (result.state === 'expired') {
    return res.status(410).json({
      success: false,
      expired: true,
      message:
        'This questionnaire link has expired. Please contact your assessment team for a new link.',
    });
  }

  const { questionnaire } = result;
  sendSuccess(res, 200, 'Questionnaire form loaded', {
    vendorName: questionnaire.vendorName,
    status: questionnaire.status,
    questions: questionnaire.questions.map((q) => ({
      id: q.id,
      text: q.text,
      doraArticle: q.doraArticle,
      category: q.category,
      hint: q.hint,
      answer: q.answer || '',
    })),
  });
});

/**
 * POST /api/v1/questionnaires/respond/:token  (PUBLIC — no auth)
 */
export const submitResponse = catchAsync(async (req, res) => {
  const { answers, final } = req.body;
  const result = await questionnaireService.submitResponse(req.params.token, { answers, final });

  if (result.state === 'alreadyComplete') {
    return res.status(200).json({
      success: true,
      alreadyComplete: true,
      message: 'Your response has already been submitted.',
    });
  }

  if (result.state === 'alreadyExpired') {
    return res.status(200).json({
      success: true,
      alreadyComplete: true,
      message: 'This questionnaire link has expired.',
    });
  }

  if (result.state === 'justExpired') {
    return res.status(410).json({
      success: false,
      expired: true,
      message: 'This questionnaire link has expired.',
    });
  }

  sendSuccess(res, 200, result.final ? 'Response submitted successfully' : 'Progress saved', {
    saved: true,
    final: result.final,
  });
});
