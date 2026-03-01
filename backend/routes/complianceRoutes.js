import { Router } from 'express';
import {
  listArticles,
  getArticle,
  listDomains,
  getMetadata,
} from '../controllers/complianceController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * All compliance routes require authentication.
 * No workspace access needed — this is shared reference data.
 */

/**
 * @route  GET /api/v1/compliance/metadata
 * @desc   Knowledge base version, lastVerified date, sources — shows when KB was last reviewed
 * @access Private
 */
router.get('/metadata', authenticate, getMetadata);

/**
 * @route  GET /api/v1/compliance/domains
 * @desc   List all DORA domains with article counts
 * @access Private
 */
router.get('/domains', authenticate, listDomains);

/**
 * @route  GET /api/v1/compliance/articles
 * @desc   List DORA articles, optionally filtered by domain or chapter (I–VI)
 * @access Private
 */
router.get('/articles', authenticate, listArticles);

/**
 * @route  GET /api/v1/compliance/articles/:article
 * @desc   Get a single DORA article by reference ("Article 30" or "Article-30")
 * @access Private
 */
router.get('/articles/:article', authenticate, getArticle);

export default router;
