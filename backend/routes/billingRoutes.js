/**
 * Billing Routes
 *
 * POST /api/v1/billing/webhook — Stripe webhook (no auth, raw body)
 *
 * Note: the webhook route is mounted with express.raw() BEFORE express.json()
 * in app.js. This file registers any future authenticated billing endpoints
 * (e.g., portal redirect) that will be added in Week 2.
 */

import express from 'express';

const router = express.Router();

// Webhook is registered directly in app.js with express.raw() to preserve
// the raw body required for Stripe signature verification.
// This router is mounted for future authenticated billing endpoints.

export default router;
