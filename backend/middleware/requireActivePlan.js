/**
 * requireActivePlan middleware
 *
 * Guards paid API routes. Reads the organization's billing state from MongoDB
 * and returns HTTP 402 when the plan is not active/trialing.
 *
 * Pass-through rules:
 *  - No req.user          → next() (public routes, e.g. questionnaire respond)
 *  - planStatus null/undef → next() (Stripe not yet provisioned — fail-open)
 *  - planStatus 'trialing' + trialEndsAt > now → next()
 *  - planStatus 'active'   → next()
 *  - anything else         → 402 with { planStatus }
 */

import { Organization } from '../models/Organization.js';
import { sendError } from '../utils/index.js';
import logger from '../config/logger.js';

export async function requireActivePlan(req, res, next) {
  // Public routes (no auth token) bypass the check
  if (!req.user) {
    return next();
  }

  try {
    const org = await Organization.findById(req.user.organizationId).select(
      'planStatus trialEndsAt'
    );

    // Org not found or billing not yet provisioned → fail-open
    if (!org || !org.planStatus) {
      return next();
    }

    const { planStatus, trialEndsAt } = org;

    if (planStatus === 'active') {
      return next();
    }

    if (planStatus === 'trialing') {
      if (trialEndsAt && trialEndsAt > new Date()) {
        return next();
      }
      // Trial has expired but Stripe hasn't fired the webhook yet — treat as past_due
      return sendError(res, 402, 'Your free trial has expired. Please add a payment method.', {
        planStatus: 'past_due',
      });
    }

    const messages = {
      past_due: 'Your payment is past due. Please update your billing information.',
      canceled: 'Your subscription has been canceled.',
      paused: 'Your subscription is paused. Please add a payment method to continue.',
    };

    return sendError(res, 402, messages[planStatus] || 'Your subscription is not active.', {
      planStatus,
    });
  } catch (err) {
    // On DB error, fail-open to avoid blocking legitimate requests
    logger.error('requireActivePlan: failed to check org billing status', {
      service: 'billing',
      userId: req.user?.userId,
      error: err.message,
    });
    return next();
  }
}
