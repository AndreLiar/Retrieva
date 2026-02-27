import { randomUUID } from 'crypto';
import { QuestionnaireTemplate } from '../models/QuestionnaireTemplate.js';
import { VendorQuestionnaire } from '../models/VendorQuestionnaire.js';
import { questionnaireQueue } from '../config/queue.js';
import { emailService } from '../services/emailService.js';
import { catchAsync, sendSuccess, sendError, AppError } from '../utils/index.js';
import logger from '../config/logger.js';

// ---------------------------------------------------------------------------
// POST /api/v1/questionnaires
// ---------------------------------------------------------------------------

export const createQuestionnaire = catchAsync(async (req, res) => {
  const { vendorName, vendorEmail, vendorContactName, workspaceId } = req.body;

  if (!vendorName || !vendorEmail) {
    return sendError(res, 400, 'Vendor name and email are required');
  }
  if (!workspaceId) {
    return sendError(res, 400, 'workspaceId is required');
  }

  const template = await QuestionnaireTemplate.findOne({ isDefault: true });
  if (!template) {
    return sendError(res, 500, 'No default questionnaire template found. Please contact support.');
  }

  // Copy questions without answer/score fields
  const questions = template.questions.map((q) => ({
    id: q.id,
    text: q.text,
    doraArticle: q.doraArticle,
    category: q.category,
    hint: q.hint,
  }));

  const questionnaire = await VendorQuestionnaire.create({
    workspaceId,
    templateId: template._id,
    vendorName: vendorName.trim(),
    vendorEmail: vendorEmail.trim().toLowerCase(),
    vendorContactName: vendorContactName?.trim() || '',
    status: 'draft',
    statusMessage: 'Created — awaiting send',
    questions,
    createdBy: req.user.userId,
  });

  logger.info('VendorQuestionnaire created', {
    service: 'questionnaire-controller',
    questionnaireId: questionnaire._id,
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

// ---------------------------------------------------------------------------
// GET /api/v1/questionnaires
// ---------------------------------------------------------------------------

export const listQuestionnaires = catchAsync(async (req, res) => {
  const { workspaceId, status, page = 1, limit = 20 } = req.query;

  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id) || [];

  const filter = { workspaceId: { $in: authorizedWorkspaceIds } };
  if (workspaceId) filter.workspaceId = workspaceId;
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [questionnaires, total] = await Promise.all([
    VendorQuestionnaire.find(filter)
      .select('-questions.answer -questions.reasoning -results.summary')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    VendorQuestionnaire.countDocuments(filter),
  ]);

  sendSuccess(res, 200, 'Questionnaires retrieved', {
    questionnaires,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/questionnaires/:id
// ---------------------------------------------------------------------------

export const getQuestionnaire = catchAsync(async (req, res) => {
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id.toString()) || [];

  const questionnaire = await VendorQuestionnaire.findById(req.params.id).lean();
  if (!questionnaire) {
    throw new AppError('Questionnaire not found', 404);
  }

  if (!authorizedWorkspaceIds.includes(questionnaire.workspaceId.toString())) {
    throw new AppError('Access denied', 403);
  }

  sendSuccess(res, 200, 'Questionnaire retrieved', { questionnaire });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/questionnaires/:id
// ---------------------------------------------------------------------------

export const deleteQuestionnaire = catchAsync(async (req, res) => {
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id.toString()) || [];

  const questionnaire = await VendorQuestionnaire.findById(req.params.id);
  if (!questionnaire) {
    throw new AppError('Questionnaire not found', 404);
  }

  if (!authorizedWorkspaceIds.includes(questionnaire.workspaceId.toString())) {
    throw new AppError('Access denied', 403);
  }

  if (questionnaire.createdBy !== req.user.userId) {
    throw new AppError('Only the creator can delete this questionnaire', 403);
  }

  await questionnaire.deleteOne();

  logger.info('VendorQuestionnaire deleted', {
    service: 'questionnaire-controller',
    questionnaireId: req.params.id,
    userId: req.user.userId,
  });

  sendSuccess(res, 200, 'Questionnaire deleted');
});

// ---------------------------------------------------------------------------
// POST /api/v1/questionnaires/:id/send
// ---------------------------------------------------------------------------

export const sendQuestionnaire = catchAsync(async (req, res) => {
  const authorizedWorkspaceIds = req.authorizedWorkspaces?.map((w) => w._id.toString()) || [];

  const questionnaire = await VendorQuestionnaire.findById(req.params.id);
  if (!questionnaire) {
    throw new AppError('Questionnaire not found', 404);
  }

  if (!authorizedWorkspaceIds.includes(questionnaire.workspaceId.toString())) {
    throw new AppError('Access denied', 403);
  }

  if (questionnaire.status === 'complete') {
    return sendError(res, 400, 'This questionnaire is already complete');
  }

  const token = randomUUID();
  const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  questionnaire.token = token;
  questionnaire.tokenExpiresAt = tokenExpiresAt;
  questionnaire.status = 'sent';
  questionnaire.sentAt = new Date();
  questionnaire.statusMessage = 'Invitation sent to vendor';
  await questionnaire.save();

  // Resolve workspace name for the email
  const workspaceName =
    req.authorizedWorkspaces?.find((w) => w._id.toString() === questionnaire.workspaceId.toString())
      ?.name || 'Your Assessment Team';

  await emailService.sendQuestionnaireInvitation({
    toEmail: questionnaire.vendorEmail,
    toName: questionnaire.vendorContactName || questionnaire.vendorName,
    senderName: req.user.name || req.user.email || 'Your assessment team',
    workspaceName,
    questionnaireId: questionnaire._id.toString(),
    token,
    expiresAt: tokenExpiresAt,
  });

  logger.info('VendorQuestionnaire sent', {
    service: 'questionnaire-controller',
    questionnaireId: questionnaire._id,
    vendorEmail: questionnaire.vendorEmail,
    tokenExpires: tokenExpiresAt,
  });

  sendSuccess(res, 200, 'Questionnaire invitation sent', {
    questionnaire: {
      _id: questionnaire._id,
      status: questionnaire.status,
      sentAt: questionnaire.sentAt,
      tokenExpiresAt: questionnaire.tokenExpiresAt,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/questionnaires/respond/:token  (PUBLIC — no auth)
// ---------------------------------------------------------------------------

export const getPublicForm = catchAsync(async (req, res) => {
  const { token } = req.params;

  const questionnaire = await VendorQuestionnaire.findOne({ token }).lean();

  if (!questionnaire) {
    throw new AppError('Questionnaire not found', 404);
  }

  if (questionnaire.status === 'complete') {
    return res.status(200).json({
      success: true,
      alreadyComplete: true,
      message: 'Your response has already been received. Thank you.',
    });
  }

  // Check expiry
  if (questionnaire.tokenExpiresAt && new Date() > new Date(questionnaire.tokenExpiresAt)) {
    await VendorQuestionnaire.findByIdAndUpdate(questionnaire._id, { status: 'expired' });
    return res.status(410).json({
      success: false,
      expired: true,
      message:
        'This questionnaire link has expired. Please contact your assessment team for a new link.',
    });
  }

  sendSuccess(res, 200, 'Questionnaire form loaded', {
    vendorName: questionnaire.vendorName,
    status: questionnaire.status,
    questions: questionnaire.questions.map((q) => ({
      id: q.id,
      text: q.text,
      doraArticle: q.doraArticle,
      category: q.category,
      hint: q.hint,
      // Return existing partial answer so the vendor can resume
      answer: q.answer || '',
    })),
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/questionnaires/respond/:token  (PUBLIC — no auth)
// ---------------------------------------------------------------------------

export const submitResponse = catchAsync(async (req, res) => {
  const { token } = req.params;
  const { answers, final } = req.body;

  if (!Array.isArray(answers)) {
    return sendError(res, 400, 'answers must be an array');
  }

  const questionnaire = await VendorQuestionnaire.findOne({ token });

  if (!questionnaire) {
    throw new AppError('Questionnaire not found', 404);
  }

  if (questionnaire.status === 'complete' || questionnaire.status === 'expired') {
    return res.status(200).json({
      success: true,
      alreadyComplete: true,
      message:
        questionnaire.status === 'complete'
          ? 'Your response has already been submitted.'
          : 'This questionnaire link has expired.',
    });
  }

  // Check expiry
  if (questionnaire.tokenExpiresAt && new Date() > new Date(questionnaire.tokenExpiresAt)) {
    questionnaire.status = 'expired';
    await questionnaire.save();
    return res.status(410).json({
      success: false,
      expired: true,
      message: 'This questionnaire link has expired.',
    });
  }

  // Merge answers into the questions array
  const answerMap = new Map(answers.map((a) => [a.id, a.answer || '']));
  for (const q of questionnaire.questions) {
    if (answerMap.has(q.id)) {
      q.answer = answerMap.get(q.id);
    }
  }

  if (final) {
    questionnaire.status = 'partial';
    questionnaire.statusMessage = 'Response received — scoring in progress';
    questionnaire.respondedAt = new Date();
    await questionnaire.save();

    // Enqueue scoring job
    await questionnaireQueue.add(
      'scoreQuestionnaire',
      { questionnaireId: questionnaire._id.toString() },
      { jobId: `scoreQuestionnaire-${questionnaire._id}` }
    );

    logger.info('VendorQuestionnaire submitted — scoring enqueued', {
      service: 'questionnaire-controller',
      questionnaireId: questionnaire._id,
    });
  } else {
    // Partial save — keep status as 'sent' to allow resume
    await questionnaire.save();
  }

  sendSuccess(res, 200, final ? 'Response submitted successfully' : 'Progress saved', {
    saved: true,
    final: !!final,
  });
});
