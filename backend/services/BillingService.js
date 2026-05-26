import { getStripe, PRICE_TO_PLAN, STRIPE_STATUS_MAP } from '../config/stripe.js';
import { AppError } from '../utils/index.js';
import { organizationRepository } from '../repositories/OrganizationRepository.js';
import { emailService } from './emailService.js';
import logger from '../config/logger.js';

function resolvePlan(subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  return PRICE_TO_PLAN[priceId] || 'starter';
}

class BillingService {
  constructor(deps = {}) {
    this.organizationRepo = deps.organizationRepo || organizationRepository;
    this.emailService = deps.emailService || emailService;
    this.stripeFactory = deps.stripeFactory || getStripe;
    this.logger = deps.logger || logger;
  }

  async findOrgByCustomerId(customerId) {
    const customer = await this.stripeFactory().customers.retrieve(customerId);
    if (!customer || customer.deleted) return null;

    const orgId = customer.metadata?.organizationId;
    if (!orgId) return null;

    return this.organizationRepo.findById(orgId);
  }

  async handleSubscriptionUpdated(subscription) {
    const org = await this.findOrgByCustomerId(subscription.customer);
    if (!org) return;

    const plan = resolvePlan(subscription);
    const planStatus = STRIPE_STATUS_MAP[subscription.status] || 'past_due';
    const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

    await this.organizationRepo.updateById(org._id, { plan, planStatus, trialEndsAt });

    this.logger.info('Subscription updated', {
      service: 'billing',
      orgId: org._id,
      plan,
      planStatus,
      trialEndsAt,
    });
  }

  async handleSubscriptionDeleted(subscription) {
    const org = await this.findOrgByCustomerId(subscription.customer);
    if (!org) return;

    await this.organizationRepo.updateById(org._id, { planStatus: 'canceled' });

    this.logger.info('Subscription canceled', { service: 'billing', orgId: org._id });
  }

  async handleTrialWillEnd(subscription) {
    const org = await this.findOrgByCustomerId(subscription.customer);
    if (!org) return;

    const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

    // Best-effort email — do not block webhook response
    this.emailService
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
        this.logger.warn('Failed to send trial_will_end email', {
          service: 'billing',
          orgId: org._id,
          error: err.message,
        });
      });

    this.logger.info('Trial will end event received', {
      service: 'billing',
      orgId: org._id,
      trialEndsAt,
    });
  }

  async handlePaymentSucceeded(invoice) {
    if (!invoice.subscription) return;

    const org = await this.findOrgByCustomerId(invoice.customer);
    if (!org) return;

    await this.organizationRepo.updateById(org._id, { planStatus: 'active' });

    this.logger.info('Payment succeeded — plan activated', {
      service: 'billing',
      orgId: org._id,
    });
  }

  async handlePaymentFailed(invoice) {
    if (!invoice.subscription) return;

    const org = await this.findOrgByCustomerId(invoice.customer);
    if (!org) return;

    await this.organizationRepo.updateById(org._id, { planStatus: 'past_due' });

    this.logger.info('Payment failed — plan set to past_due', {
      service: 'billing',
      orgId: org._id,
    });
  }

  async dispatchWebhookEvent(event) {
    switch (event.type) {
      case 'customer.subscription.updated':
        return this.handleSubscriptionUpdated(event.data.object);
      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(event.data.object);
      case 'customer.subscription.trial_will_end':
        return this.handleTrialWillEnd(event.data.object);
      case 'invoice.payment_succeeded':
        return this.handlePaymentSucceeded(event.data.object);
      case 'invoice.payment_failed':
        return this.handlePaymentFailed(event.data.object);
      default:
        // Silently ignore unhandled event types
        return undefined;
    }
  }

  async createPortalSession(organizationId) {
    const org = await this.organizationRepo.findById(organizationId, {
      select: 'stripeCustomerId',
    });
    if (!org?.stripeCustomerId) {
      throw new AppError('Billing not yet provisioned for this organization', 400);
    }

    const session = await this.stripeFactory().billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/settings/billing`,
    });

    return { url: session.url };
  }
}

export const billingService = new BillingService();
export { BillingService };
