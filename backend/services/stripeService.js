/**
 * Stripe Service
 *
 * Thin wrapper around Stripe API calls used during organization onboarding
 * and subscription lifecycle management.
 *
 * @module services/stripeService
 */

import { stripe } from '../config/stripe.js';
import logger from '../config/logger.js';

const TRIAL_PERIOD_DAYS = 20;

/**
 * Provision Stripe billing for a newly created organization.
 *
 * Creates a Stripe Customer and a Subscription using the Starter price,
 * with a 20-day trial. Missing payment method at trial end → subscription paused.
 *
 * @param {string} orgId   - MongoDB Organization _id (stored in customer metadata)
 * @param {string} email   - Owner's email address
 * @param {string} name    - Organization name
 * @returns {{ customerId: string, subscriptionId: string, trialEndsAt: Date }}
 */
export async function setupOrgBilling(orgId, email, name) {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { organizationId: orgId.toString() },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: process.env.STRIPE_PRICE_STARTER }],
    trial_period_days: TRIAL_PERIOD_DAYS,
    trial_settings: {
      end_behavior: { missing_payment_method: 'pause' },
    },
  });

  const trialEndsAt = new Date(subscription.trial_end * 1000);

  logger.info('Stripe billing provisioned', {
    service: 'stripe',
    orgId,
    customerId: customer.id,
    subscriptionId: subscription.id,
    trialEndsAt,
  });

  return {
    customerId: customer.id,
    subscriptionId: subscription.id,
    trialEndsAt,
  };
}
