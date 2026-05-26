import { randomUUID } from 'crypto';
import { AppError } from '../utils/index.js';
import { questionnaireTemplateRepository } from '../repositories/QuestionnaireTemplateRepository.js';
import { vendorQuestionnaireRepository } from '../repositories/VendorQuestionnaireRepository.js';
import { questionnaireQueue } from '../config/queue.js';
import { emailService } from './emailService.js';
import logger from '../config/logger.js';

const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

class QuestionnaireService {
  constructor(deps = {}) {
    this.templateRepo = deps.templateRepo || questionnaireTemplateRepository;
    this.questionnaireRepo = deps.questionnaireRepo || vendorQuestionnaireRepository;
    this.questionnaireQueue = deps.questionnaireQueue || questionnaireQueue;
    this.emailService = deps.emailService || emailService;
    this.logger = deps.logger || logger;
  }

  async createQuestionnaire({ vendorName, vendorEmail, vendorContactName, workspaceId, userId }) {
    if (!vendorName || !vendorEmail) {
      throw new AppError('Vendor name and email are required', 400);
    }
    if (!workspaceId) {
      throw new AppError('workspaceId is required', 400);
    }

    const template = await this.templateRepo.findDefault();
    if (!template) {
      throw new AppError(
        'No default questionnaire template found. Please contact support.',
        500
      );
    }

    const questions = template.questions.map((q) => ({
      id: q.id,
      text: q.text,
      doraArticle: q.doraArticle,
      category: q.category,
      hint: q.hint,
    }));

    const questionnaire = await this.questionnaireRepo.create({
      workspaceId,
      templateId: template._id,
      vendorName: vendorName.trim(),
      vendorEmail: vendorEmail.trim().toLowerCase(),
      vendorContactName: vendorContactName?.trim() || '',
      status: 'draft',
      statusMessage: 'Created — awaiting send',
      questions,
      createdBy: userId,
    });

    this.logger.info('VendorQuestionnaire created', {
      service: 'questionnaire-service',
      questionnaireId: questionnaire._id,
      userId,
    });

    return questionnaire;
  }

  async listQuestionnaires({ authorizedWorkspaceIds, workspaceId, status, page, limit }) {
    const filter = { workspaceId: { $in: authorizedWorkspaceIds } };
    if (workspaceId) filter.workspaceId = workspaceId;
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [questionnaires, total] = await Promise.all([
      this.questionnaireRepo.find(filter, {
        select: '-questions.answer -questions.reasoning -results.summary',
        sort: { createdAt: -1 },
        skip,
        limit: parseInt(limit),
        lean: true,
      }),
      this.questionnaireRepo.count(filter),
    ]);

    return {
      questionnaires,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    };
  }

  async getQuestionnaire(id, authorizedWorkspaceIds) {
    const questionnaire = await this.questionnaireRepo.findById(id, { lean: true });
    if (!questionnaire) throw new AppError('Questionnaire not found', 404);
    if (!authorizedWorkspaceIds.includes(questionnaire.workspaceId.toString())) {
      throw new AppError('Access denied', 403);
    }
    return questionnaire;
  }

  async deleteQuestionnaire(id, userId, authorizedWorkspaceIds) {
    const questionnaire = await this.questionnaireRepo.findById(id);
    if (!questionnaire) throw new AppError('Questionnaire not found', 404);
    if (!authorizedWorkspaceIds.includes(questionnaire.workspaceId.toString())) {
      throw new AppError('Access denied', 403);
    }
    if (questionnaire.createdBy !== userId) {
      throw new AppError('Only the creator can delete this questionnaire', 403);
    }

    await questionnaire.deleteOne();

    this.logger.info('VendorQuestionnaire deleted', {
      service: 'questionnaire-service',
      questionnaireId: id,
      userId,
    });
  }

  async sendQuestionnaire(id, { userId, userName, userEmail }, authorizedWorkspaces) {
    const authorizedWorkspaceIds = authorizedWorkspaces.map((w) => w._id.toString());
    const questionnaire = await this.questionnaireRepo.findById(id);
    if (!questionnaire) throw new AppError('Questionnaire not found', 404);
    if (!authorizedWorkspaceIds.includes(questionnaire.workspaceId.toString())) {
      throw new AppError('Access denied', 403);
    }
    if (questionnaire.status === 'complete') {
      throw new AppError('This questionnaire is already complete', 400);
    }

    const token = randomUUID();
    const tokenExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    questionnaire.token = token;
    questionnaire.tokenExpiresAt = tokenExpiresAt;
    questionnaire.status = 'sent';
    questionnaire.sentAt = new Date();
    questionnaire.statusMessage = 'Invitation sent to vendor';
    await questionnaire.save();

    const workspaceName =
      authorizedWorkspaces.find(
        (w) => w._id.toString() === questionnaire.workspaceId.toString()
      )?.name || 'Your Assessment Team';

    await this.emailService.sendQuestionnaireInvitation({
      toEmail: questionnaire.vendorEmail,
      toName: questionnaire.vendorContactName || questionnaire.vendorName,
      senderName: userName || userEmail || 'Your assessment team',
      workspaceName,
      questionnaireId: questionnaire._id.toString(),
      token,
      expiresAt: tokenExpiresAt,
    });

    this.logger.info('VendorQuestionnaire sent', {
      service: 'questionnaire-service',
      questionnaireId: questionnaire._id,
      vendorEmail: questionnaire.vendorEmail,
      tokenExpires: tokenExpiresAt,
    });

    return questionnaire;
  }

  async getPublicForm(token) {
    const questionnaire = await this.questionnaireRepo.findByToken(token, { lean: true });
    if (!questionnaire) throw new AppError('Questionnaire not found', 404);

    if (questionnaire.status === 'complete') {
      return { state: 'complete' };
    }

    if (
      questionnaire.tokenExpiresAt &&
      new Date() > new Date(questionnaire.tokenExpiresAt)
    ) {
      await this.questionnaireRepo.updateById(questionnaire._id, { status: 'expired' });
      return { state: 'expired' };
    }

    return { state: 'ok', questionnaire };
  }

  async submitResponse(token, { answers, final }) {
    if (!Array.isArray(answers)) {
      throw new AppError('answers must be an array', 400);
    }

    const questionnaire = await this.questionnaireRepo.findByToken(token);
    if (!questionnaire) throw new AppError('Questionnaire not found', 404);

    // Already-final state: report it but don't change anything (200).
    if (questionnaire.status === 'complete') {
      return { state: 'alreadyComplete' };
    }
    if (questionnaire.status === 'expired') {
      return { state: 'alreadyExpired' };
    }

    // Token expired during THIS request — flip status and signal a 410.
    if (
      questionnaire.tokenExpiresAt &&
      new Date() > new Date(questionnaire.tokenExpiresAt)
    ) {
      questionnaire.status = 'expired';
      await questionnaire.save();
      return { state: 'justExpired' };
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

      await this.questionnaireQueue.add(
        'scoreQuestionnaire',
        { questionnaireId: questionnaire._id.toString() },
        { jobId: `scoreQuestionnaire-${questionnaire._id}` }
      );

      this.logger.info('VendorQuestionnaire submitted — scoring enqueued', {
        service: 'questionnaire-service',
        questionnaireId: questionnaire._id,
      });
    } else {
      await questionnaire.save();
    }

    return { state: 'saved', final: !!final };
  }
}

export const questionnaireService = new QuestionnaireService();
export { QuestionnaireService };
