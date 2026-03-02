/**
 * Billing Routes
 *
 * POST /api/v1/billing/webhook — Stripe webhook (no auth, raw body)
 * POST /api/v1/billing/portal  — Create Stripe Customer Portal session (authenticated)
 *
 * Note: the webhook route is mounted with express.raw() BEFORE express.json()
 * in app.js.
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { createPortalSession } from '../controllers/billingController.js';

const router = express.Router();

router.post('/portal', authenticate, createPortalSession);

export default router;
