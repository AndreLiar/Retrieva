/**
 * Billing Controller
 *
 * Verifies Stripe webhook signatures and dispatches events to BillingService.
 * Also exposes the customer-portal session endpoint.
 *
 * @module controllers/billingController
 */

import { getStripe } from '../config/stripe.js';
import { billingService } from '../services/BillingService.js';
import { catchAsync, sendError, sendSuccess } from '../utils/index.js';
import logger from '../config/logger.js';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * POST /api/v1/billing/portal — create Stripe Customer Portal session
 */
export const createPortalSession = catchAsync(async (req, res) => {
  const { url } = await billingService.createPortalSession(req.user.organizationId);
  sendSuccess(res, 200, 'Portal session created', { url });
});

/**
 * Webhook entry point (raw body required — mounted before express.json())
 */
export async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    logger.warn('Stripe webhook signature verification failed', {
      service: 'billing',
      error: err.message,
    });
    return sendError(res, 400, `Webhook Error: ${err.message}`);
  }

  try {
    await billingService.dispatchWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook handler error', {
      service: 'billing',
      eventType: event.type,
      error: err.message,
    });
    // Return 200 anyway to prevent Stripe retries for internal errors
    res.json({ received: true, warning: 'Handler error logged' });
  }
}
