/**
 * Billing Controller
 *
 * Handles Stripe webhook events and syncs subscription state to MongoDB.
 *
 * Supported events:
 *   customer.subscription.updated   → sync plan, planStatus, trialEndsAt
 *   customer.subscription.deleted   → set planStatus = 'canceled'
 *   customer.subscription.trial_will_end → send "3 days left" email
 *   invoice.payment_succeeded       → set planStatus = 'active'
 *   invoice.payment_failed          → set planStatus = 'past_due'
 *
 * @module controllers/billingController
 */

import { stripe, PRICE_TO_PLAN, STRIPE_STATUS_MAP } from '../config/stripe.js';
import { Organization } from '../models/Organization.js';
import { emailService } from '../services/emailService.js';
import { sendError } from '../utils/index.js';
import logger from '../config/logger.js';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function findOrgByCustomerId(customerId) {
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) return null;

  const orgId = customer.metadata?.organizationId;
  if (!orgId) return null;

  return Organization.findById(orgId);
}

function resolvePlan(subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  return PRICE_TO_PLAN[priceId] || 'starter';
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleSubscriptionUpdated(subscription) {
  const org = await findOrgByCustomerId(subscription.customer);
  if (!org) return;

  const plan = resolvePlan(subscription);
  const planStatus = STRIPE_STATUS_MAP[subscription.status] || 'past_due';
  const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  await Organization.findByIdAndUpdate(org._id, { plan, planStatus, trialEndsAt });

  logger.info('Subscription updated', {
    service: 'billing',
    orgId: org._id,
    plan,
    planStatus,
    trialEndsAt,
  });
}

async function handleSubscriptionDeleted(subscription) {
  const org = await findOrgByCustomerId(subscription.customer);
  if (!org) return;

  await Organization.findByIdAndUpdate(org._id, { planStatus: 'canceled' });

  logger.info('Subscription canceled', { service: 'billing', orgId: org._id });
}

async function handleTrialWillEnd(subscription) {
  const org = await findOrgByCustomerId(subscription.customer);
  if (!org) return;

  const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  // Best-effort email — do not block webhook response
  emailService
    .sendEmail({
      to: subscription.customer_email || org.email,
      subject: 'Your Retrieva trial ends in 3 days',
      html: `
        <p>Your 20-day free trial on <strong>Retrieva</strong> will end on
        <strong>${trialEndsAt ? trialEndsAt.toDateString() : 'soon'}</strong>.</p>
        <p>Add a payment method in your billing settings to continue using Retrieva
        without interruption.</p>
        <p><a href="${process.env.FRONTEND_URL}/settings/billing">Manage billing</a></p>
      `,
    })
    .catch((err) => {
      logger.warn('Failed to send trial_will_end email', {
        service: 'billing',
        orgId: org._id,
        error: err.message,
      });
    });

  logger.info('Trial will end event received', {
    service: 'billing',
    orgId: org._id,
    trialEndsAt,
  });
}

async function handlePaymentSucceeded(invoice) {
  if (!invoice.subscription) return;

  const org = await findOrgByCustomerId(invoice.customer);
  if (!org) return;

  await Organization.findByIdAndUpdate(org._id, { planStatus: 'active' });

  logger.info('Payment succeeded — plan activated', { service: 'billing', orgId: org._id });
}

async function handlePaymentFailed(invoice) {
  if (!invoice.subscription) return;

  const org = await findOrgByCustomerId(invoice.customer);
  if (!org) return;

  await Organization.findByIdAndUpdate(org._id, { planStatus: 'past_due' });

  logger.info('Payment failed — plan set to past_due', { service: 'billing', orgId: org._id });
}

// ---------------------------------------------------------------------------
// Webhook entry point (raw body required — mounted before express.json())
// ---------------------------------------------------------------------------

export async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    logger.warn('Stripe webhook signature verification failed', {
      service: 'billing',
      error: err.message,
    });
    return sendError(res, 400, `Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        // Silently ignore unhandled event types
        break;
    }

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
