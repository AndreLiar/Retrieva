import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { catchAsync } from '../utils/core/errorHandler.js';
import { sendSuccess, sendError } from '../utils/core/responseFormatter.js';
import {
  getCloudConsentDisclosure,
  canUseCloudEmbeddings,
  getProviderMetrics,
  auditLog,
  isCloudAvailable,
  TrustLevel,
} from '../config/embeddingProvider.js';
import logger from '../config/logger.js';

/**
 * Helper to find workspace by ID and verify user access
 * @param {string} workspaceId - MongoDB _id of the workspace
 * @param {string} userId - Current user's ID
 * @returns {Promise<Object|null>} Workspace or null if not found/unauthorized
 */
async function findWorkspaceWithAccess(workspaceId, userId) {
  const workspace = await NotionWorkspace.findById(workspaceId);
  if (!workspace) return null;

  // Check if user is owner
  if (workspace.userId && workspace.userId.toString() === userId.toString()) {
    return workspace;
  }

  return null; // User doesn't have access
}

/**
 * Get embedding settings for a workspace
 */
export const getEmbeddingSettings = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.userId;

  const workspace = await findWorkspaceWithAccess(workspaceId, userId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  const settings = {
    trustLevel: workspace.trustLevel || TrustLevel.INTERNAL,
    embeddingSettings: workspace.embeddingSettings || {
      preferCloud: false,
      cloudConsent: false,
      fallbackToCloud: true,
    },
    cloudAvailable: isCloudAvailable(),
    canUseCloud: canUseCloudEmbeddings(workspace),
  };

  return sendSuccess(res, 200, 'Embedding settings retrieved', settings);
});

/**
 * Update embedding settings for a workspace
 */
export const updateEmbeddingSettings = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.userId;
  const { trustLevel, preferCloud, cloudConsent, fallbackToCloud } = req.body;

  const workspace = await findWorkspaceWithAccess(workspaceId, userId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  // Update trust level if provided
  if (trustLevel && Object.values(TrustLevel).includes(trustLevel)) {
    workspace.trustLevel = trustLevel;
  }

  // Update embedding settings
  if (!workspace.embeddingSettings) {
    workspace.embeddingSettings = {};
  }

  if (preferCloud !== undefined) {
    workspace.embeddingSettings.preferCloud = preferCloud;
  }

  if (fallbackToCloud !== undefined) {
    workspace.embeddingSettings.fallbackToCloud = fallbackToCloud;
  }

  // Handle cloud consent with timestamp
  if (cloudConsent !== undefined) {
    workspace.embeddingSettings.cloudConsent = cloudConsent;
    if (cloudConsent) {
      workspace.embeddingSettings.cloudConsentDate = new Date();
    }
  }

  await workspace.save();

  logger.info('Embedding settings updated', {
    service: 'embedding-controller',
    workspaceId,
    userId,
    trustLevel: workspace.trustLevel,
    cloudConsent: workspace.embeddingSettings.cloudConsent,
  });

  // Audit log for consent changes
  if (cloudConsent !== undefined) {
    auditLog.log({
      workspaceId,
      userId,
      action: cloudConsent ? 'consent_granted' : 'consent_revoked',
      trustLevel: workspace.trustLevel,
    });
  }

  return sendSuccess(res, 200, 'Embedding settings updated', {
    trustLevel: workspace.trustLevel,
    embeddingSettings: workspace.embeddingSettings,
    canUseCloud: canUseCloudEmbeddings(workspace),
  });
});

/**
 * Get cloud consent disclosure information (GDPR)
 */
export const getConsentDisclosure = catchAsync(async (_req, res) => {
  const disclosure = getCloudConsentDisclosure();
  return sendSuccess(res, 200, 'Cloud consent disclosure', disclosure);
});

/**
 * Grant cloud embedding consent
 */
export const grantCloudConsent = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.userId;
  const { acknowledged } = req.body;

  if (!acknowledged) {
    return sendError(res, 400, 'You must acknowledge the consent disclosure');
  }

  const workspace = await findWorkspaceWithAccess(workspaceId, userId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  // Check if workspace can use cloud
  if (workspace.trustLevel === TrustLevel.REGULATED) {
    return sendError(
      res,
      403,
      'This workspace is marked as regulated and cannot use cloud embeddings'
    );
  }

  // Update consent
  if (!workspace.embeddingSettings) {
    workspace.embeddingSettings = {};
  }
  workspace.embeddingSettings.cloudConsent = true;
  workspace.embeddingSettings.cloudConsentDate = new Date();

  await workspace.save();

  // Audit log
  auditLog.log({
    workspaceId,
    userId,
    action: 'consent_granted',
    trustLevel: workspace.trustLevel,
    timestamp: new Date().toISOString(),
  });

  logger.info('Cloud embedding consent granted', {
    service: 'embedding-controller',
    workspaceId,
    userId,
  });

  return sendSuccess(res, 200, 'Cloud embedding consent granted', {
    consentDate: workspace.embeddingSettings.cloudConsentDate,
    canUseCloud: canUseCloudEmbeddings(workspace),
  });
});

/**
 * Revoke cloud embedding consent
 */
export const revokeCloudConsent = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.userId;

  const workspace = await findWorkspaceWithAccess(workspaceId, userId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  // Update consent
  if (!workspace.embeddingSettings) {
    workspace.embeddingSettings = {};
  }
  workspace.embeddingSettings.cloudConsent = false;
  workspace.embeddingSettings.preferCloud = false; // Also disable preference

  await workspace.save();

  // Audit log
  auditLog.log({
    workspaceId,
    userId,
    action: 'consent_revoked',
    trustLevel: workspace.trustLevel,
    timestamp: new Date().toISOString(),
  });

  logger.info('Cloud embedding consent revoked', {
    service: 'embedding-controller',
    workspaceId,
    userId,
  });

  return sendSuccess(res, 200, 'Cloud embedding consent revoked', {
    canUseCloud: false,
  });
});

/**
 * Get embedding metrics (admin only)
 */
export const getMetrics = catchAsync(async (_req, res) => {
  const metrics = getProviderMetrics();
  return sendSuccess(res, 200, 'Embedding metrics', metrics);
});

/**
 * Data classification options for user declaration
 * Note: All embeddings are processed via Azure OpenAI (enterprise-grade cloud)
 */
const DATA_CLASSIFICATION_OPTIONS = {
  personal_notes: {
    label: 'Personal Notes',
    description: 'Personal notes, journals, non-sensitive content',
    recommendedTrustLevel: 'public',
    canUseCloud: true,
  },
  team_docs: {
    label: 'Team Documents',
    description: 'Team collaboration docs, project notes, meeting notes',
    recommendedTrustLevel: 'internal',
    canUseCloud: true, // With consent
  },
  company_confidential: {
    label: 'Company Confidential',
    description: 'Business strategies, financials, HR documents, trade secrets',
    recommendedTrustLevel: 'internal',
    canUseCloud: true, // With explicit consent
  },
  regulated_data: {
    label: 'Regulated Data',
    description: 'Medical records, legal docs, financial PII, government data',
    recommendedTrustLevel: 'regulated',
    canUseCloud: true, // Azure OpenAI provides enterprise compliance
    requiresComplianceReview: true, // Flag for additional review
  },
};

/**
 * Get data classification options for UI
 */
export const getClassificationOptions = catchAsync(async (_req, res) => {
  return sendSuccess(res, 200, 'Data classification options', {
    options: DATA_CLASSIFICATION_OPTIONS,
    note: 'Select the option that best describes your workspace data. The system will auto-detect and upgrade if more sensitive data is found.',
  });
});

/**
 * Declare data classification for a workspace (Option 1)
 */
export const declareDataClassification = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.userId;
  const { classificationType, description } = req.body;

  // Validate classification type
  if (!classificationType || !DATA_CLASSIFICATION_OPTIONS[classificationType]) {
    return sendError(res, 400, 'Invalid classification type');
  }

  const workspace = await findWorkspaceWithAccess(workspaceId, userId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  const classificationInfo = DATA_CLASSIFICATION_OPTIONS[classificationType];

  // Set data classification
  workspace.dataClassification = {
    declaredType: classificationType,
    declaredAt: new Date(),
    declaredBy: userId,
    description: description || classificationInfo.description,
  };

  // Determine if trust level should be updated
  const trustLevelPriority = { public: 0, internal: 1, regulated: 2 };
  const currentPriority = trustLevelPriority[workspace.trustLevel] || 1;
  const recommendedPriority = trustLevelPriority[classificationInfo.recommendedTrustLevel] || 1;
  const piiAutoDetected = workspace.embeddingSettings?.autoUpgraded === true;
  let trustLevelDowngradeBlocked = false;

  // Trust level update logic:
  // - If PII was auto-detected, only allow upgrade (security measure)
  // - If user explicitly declares, allow both upgrade and downgrade
  if (piiAutoDetected) {
    // PII was detected - only upgrade, never downgrade for safety
    if (recommendedPriority > currentPriority) {
      workspace.trustLevel = classificationInfo.recommendedTrustLevel;
    }
    // Mark if downgrade was blocked due to PII detection
    if (recommendedPriority < currentPriority) {
      trustLevelDowngradeBlocked = true;
      logger.info('Trust level downgrade blocked due to PII detection', {
        service: 'embedding-controller',
        workspaceId,
        userId,
        requested: classificationInfo.recommendedTrustLevel,
        current: workspace.trustLevel,
      });
    }
  } else {
    // No PII detected - user's explicit declaration sets the trust level
    workspace.trustLevel = classificationInfo.recommendedTrustLevel;
  }

  // If regulated, mark for compliance review (Azure OpenAI provides enterprise security)
  if (classificationInfo.recommendedTrustLevel === 'regulated') {
    if (!workspace.embeddingSettings) {
      workspace.embeddingSettings = {};
    }
    workspace.embeddingSettings.requiresComplianceReview = true;
    // Note: We still use Azure OpenAI which provides enterprise-grade compliance
  }

  await workspace.save();

  // Audit log
  auditLog.log({
    workspaceId,
    userId,
    action: 'data_classification_declared',
    classificationType,
    trustLevel: workspace.trustLevel,
  });

  logger.info('Data classification declared', {
    service: 'embedding-controller',
    workspaceId,
    userId,
    classificationType,
    trustLevel: workspace.trustLevel,
  });

  // Build response note
  let note;
  if (trustLevelDowngradeBlocked) {
    note = 'Trust level not changed: PII was previously detected in your documents. Contact support to reset if this is incorrect.';
  } else if (classificationInfo.requiresComplianceReview) {
    note = 'Data marked for compliance review. Azure OpenAI provides enterprise-grade security for processing.';
  } else {
    note = 'Processing enabled via Azure OpenAI with enterprise security';
  }

  return sendSuccess(res, 200, 'Data classification saved', {
    dataClassification: workspace.dataClassification,
    trustLevel: workspace.trustLevel,
    canUseCloud: canUseCloudEmbeddings(workspace),
    trustLevelDowngradeBlocked,
    note,
  });
});

/**
 * Get PII detection status for a workspace
 */
export const getPiiStatus = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.userId;

  const workspace = await findWorkspaceWithAccess(workspaceId, userId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  const piiStatus = {
    lastScan: workspace.embeddingSettings?.lastPiiScan || null,
    piiDetected: workspace.embeddingSettings?.piiDetected || false,
    detectedPatterns: workspace.embeddingSettings?.detectedPatterns || [],
    autoUpgraded: workspace.embeddingSettings?.autoUpgraded || false,
    autoUpgradedAt: workspace.embeddingSettings?.autoUpgradedAt || null,
    autoUpgradedFrom: workspace.embeddingSettings?.autoUpgradedFrom || null,
    currentTrustLevel: workspace.trustLevel,
    dataClassification: workspace.dataClassification || { declaredType: 'not_set' },
  };

  return sendSuccess(res, 200, 'PII detection status', piiStatus);
});

/**
 * Get audit log for a workspace
 */
export const getAuditLog = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.userId;
  const { limit = 50 } = req.query;

  // Verify user owns the workspace
  const workspace = await findWorkspaceWithAccess(workspaceId, userId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  const logs = auditLog.getByWorkspace(workspaceId, parseInt(limit));
  return sendSuccess(res, 200, 'Audit log retrieved', { logs });
});

export default {
  getEmbeddingSettings,
  updateEmbeddingSettings,
  getConsentDisclosure,
  grantCloudConsent,
  revokeCloudConsent,
  getMetrics,
  getAuditLog,
  getClassificationOptions,
  declareDataClassification,
  getPiiStatus,
};
