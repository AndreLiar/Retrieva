import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
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
} from '../controllers/embeddingController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Embeddings
 *   description: Embedding settings and cloud consent management
 */

/**
 * @swagger
 * /api/v1/embeddings/disclosure:
 *   get:
 *     summary: Get cloud embedding consent disclosure (GDPR)
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Consent disclosure information
 */
router.get('/disclosure', authenticate, getConsentDisclosure);

/**
 * @swagger
 * /api/v1/embeddings/metrics:
 *   get:
 *     summary: Get embedding provider metrics
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Provider metrics
 */
router.get('/metrics', authenticate, getMetrics);

/**
 * @swagger
 * /api/v1/embeddings/workspace/{workspaceId}:
 *   get:
 *     summary: Get embedding settings for a workspace
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Embedding settings
 */
router.get('/workspace/:workspaceId', authenticate, getEmbeddingSettings);

/**
 * @swagger
 * /api/v1/embeddings/workspace/{workspaceId}:
 *   patch:
 *     summary: Update embedding settings for a workspace
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trustLevel:
 *                 type: string
 *                 enum: [public, internal, regulated]
 *               preferCloud:
 *                 type: boolean
 *               cloudConsent:
 *                 type: boolean
 *               fallbackToCloud:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated settings
 */
router.patch('/workspace/:workspaceId', authenticate, updateEmbeddingSettings);

/**
 * @swagger
 * /api/v1/embeddings/workspace/{workspaceId}/consent:
 *   post:
 *     summary: Grant cloud embedding consent
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - acknowledged
 *             properties:
 *               acknowledged:
 *                 type: boolean
 *                 description: User acknowledges the disclosure
 *     responses:
 *       200:
 *         description: Consent granted
 */
router.post('/workspace/:workspaceId/consent', authenticate, grantCloudConsent);

/**
 * @swagger
 * /api/v1/embeddings/workspace/{workspaceId}/consent:
 *   delete:
 *     summary: Revoke cloud embedding consent
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consent revoked
 */
router.delete('/workspace/:workspaceId/consent', authenticate, revokeCloudConsent);

/**
 * @swagger
 * /api/v1/embeddings/workspace/{workspaceId}/audit:
 *   get:
 *     summary: Get embedding audit log for a workspace
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Audit log entries
 */
router.get('/workspace/:workspaceId/audit', authenticate, getAuditLog);

/**
 * @swagger
 * /api/v1/embeddings/classification-options:
 *   get:
 *     summary: Get data classification options for user declaration
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Classification options
 */
router.get('/classification-options', authenticate, getClassificationOptions);

/**
 * @swagger
 * /api/v1/embeddings/workspace/{workspaceId}/classify:
 *   post:
 *     summary: Declare data classification for a workspace
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classificationType
 *             properties:
 *               classificationType:
 *                 type: string
 *                 enum: [personal_notes, team_docs, company_confidential, regulated_data]
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Classification saved
 */
router.post('/workspace/:workspaceId/classify', authenticate, declareDataClassification);

/**
 * @swagger
 * /api/v1/embeddings/workspace/{workspaceId}/pii-status:
 *   get:
 *     summary: Get PII detection status for a workspace
 *     tags: [Embeddings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PII detection status
 */
router.get('/workspace/:workspaceId/pii-status', authenticate, getPiiStatus);

export default router;
