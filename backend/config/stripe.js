import Stripe from 'stripe';

// Lazy singleton — avoids instantiation failure when STRIPE_SECRET_KEY is not
// set (e.g. in test environments). The instance is created on first use.
let _stripe = null;
export function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  }
  return _stripe;
}

export const PLAN_LIMITS = {
  starter: { vendors: 10, members: 3 },
  professional: { vendors: 50, members: 10 },
  business: { vendors: 150, members: 30 },
  enterprise: { vendors: Infinity, members: Infinity },
};

// Map Stripe Price IDs → internal plan names (set once products are created in Stripe Dashboard)
export const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_STARTER]: 'starter',
  [process.env.STRIPE_PRICE_PROFESSIONAL]: 'professional',
  [process.env.STRIPE_PRICE_BUSINESS]: 'business',
};

// Map Stripe subscription.status → internal planStatus
export const STRIPE_STATUS_MAP = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  paused: 'paused',
  unpaid: 'past_due',
  incomplete: 'past_due',
};
