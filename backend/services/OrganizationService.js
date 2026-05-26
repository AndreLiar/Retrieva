import { AppError } from '../utils/index.js';
import { safeDecrypt } from '../utils/security/fieldEncryption.js';
import { organizationRepository } from '../repositories/OrganizationRepository.js';
import { organizationMemberRepository } from '../repositories/OrganizationMemberRepository.js';
import { userRepository } from '../repositories/UserRepository.js';
import { emailService } from './emailService.js';
import { setupOrgBilling } from './stripeService.js';
import logger from '../config/logger.js';

const VALID_ROLES = ['org_admin', 'analyst', 'viewer'];
const TRIAL_DAYS = 20;

class OrganizationService {
  constructor(deps = {}) {
    this.organizationRepo = deps.organizationRepo || organizationRepository;
    this.memberRepo = deps.memberRepo || organizationMemberRepository;
    this.userRepo = deps.userRepo || userRepository;
    this.emailService = deps.emailService || emailService;
    this.setupOrgBilling = deps.setupOrgBilling || setupOrgBilling;
    this.logger = deps.logger || logger;
  }

  async createOrganization(userId, { name, industry, country }) {
    if (!name?.trim()) throw new AppError('Organization name is required', 400);

    const existing = await this.memberRepo.findActiveByUserId(userId);
    if (existing) throw new AppError('You already belong to an organization', 409);

    const org = await this.organizationRepo.create({
      name: name.trim(),
      industry: industry || 'other',
      country: country?.trim() || '',
      ownerId: userId,
    });

    const user = await this.userRepo.findById(userId);

    await this.memberRepo.create({
      organizationId: org._id,
      userId,
      email: user.email,
      role: 'org_admin',
      status: 'active',
      joinedAt: new Date(),
    });

    await this.userRepo.updateById(userId, { organizationId: org._id });

    // Provision Stripe billing — failure must never block org creation
    let billingFields = {
      plan: 'starter',
      planStatus: 'trialing',
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    };
    try {
      const billing = await this.setupOrgBilling(org._id, user.email, org.name);
      billingFields = {
        stripeCustomerId: billing.customerId,
        stripeSubscriptionId: billing.subscriptionId,
        plan: 'starter',
        planStatus: 'trialing',
        trialEndsAt: billing.trialEndsAt,
      };
    } catch (err) {
      this.logger.error('Stripe billing provisioning failed — using local fallback', {
        service: 'organization',
        orgId: org._id,
        error: err.message,
      });
    }

    await this.organizationRepo.updateById(org._id, billingFields);

    this.logger.info('Organization created', {
      service: 'organization',
      orgId: org._id,
      userId,
    });

    return { org, billingFields };
  }

  async getMyOrganization(userId) {
    const membership = await this.memberRepo.findOne(
      { userId, status: 'active' },
      { populate: 'organizationId' }
    );

    if (!membership || !membership.organizationId) {
      return { organization: null, role: null };
    }

    const org = membership.organizationId;
    return { organization: org, role: membership.role };
  }

  async getInviteInfo(token) {
    if (!token) throw new AppError('Token is required', 400);

    const member = await this.memberRepo.findByToken(token);
    if (!member) throw new AppError('Invalid or expired invite link', 404);

    const org = await this.organizationRepo.findById(member.organizationId);
    if (!org) throw new AppError('Organization not found', 404);

    let inviterName = null;
    if (member.invitedBy) {
      const inviter = await this.userRepo.findById(member.invitedBy, {
        select: 'name email',
      });
      if (inviter) {
        inviterName = safeDecrypt(inviter.name) || inviter.email;
      }
    }

    return {
      organizationName: org.name,
      inviterName,
      role: member.role,
      email: member.email,
    };
  }

  async inviteMember(inviterId, { email, role = 'analyst' }) {
    if (!email) throw new AppError('Email is required', 400);
    if (!VALID_ROLES.includes(role)) throw new AppError('Invalid role', 400);

    const callerMembership = await this.memberRepo.findActiveByUserId(inviterId);
    if (!callerMembership) throw new AppError('You do not belong to an organization', 403);
    if (callerMembership.role !== 'org_admin') {
      throw new AppError('Only org admins can invite members', 403);
    }

    const orgId = callerMembership.organizationId;

    const existingActive = await this.memberRepo.findOne({
      organizationId: orgId,
      email: email.toLowerCase(),
      status: 'active',
    });
    if (existingActive) {
      throw new AppError('This user is already an active member', 409);
    }

    const { member, rawToken } = await this.memberRepo.createInvite(
      orgId,
      email,
      role,
      inviterId
    );

    const org = await this.organizationRepo.findById(orgId);
    const inviter = await this.userRepo.findById(inviterId, { select: 'name email' });
    const inviterName = safeDecrypt(inviter?.name) || inviter?.email || 'A team member';

    this.emailService
      .sendOrganizationInvitation({
        toEmail: email,
        inviterName,
        organizationName: org.name,
        role,
        inviteToken: rawToken,
      })
      .catch((err) => {
        this.logger.warn('Failed to send org invitation email', {
          service: 'organization',
          error: err.message,
        });
      });

    // Mark checklist item — fire and forget, non-critical
    this.userRepo
      .updateOne(
        { _id: inviterId, 'onboardingChecklist.memberInvited': false },
        { $set: { 'onboardingChecklist.memberInvited': true } }
      )
      .catch(() => {});

    this.logger.info('Org invite sent', {
      service: 'organization',
      orgId,
      email,
      role,
      inviterId,
    });

    return member;
  }

  async acceptInvite(userId, token) {
    if (!token) throw new AppError('Token is required', 400);

    const member = await this.memberRepo.findByToken(token);
    if (!member) throw new AppError('Invalid or expired invite token', 404);

    const user = await this.userRepo.findById(userId);
    if (!user) throw new AppError('User not found', 404);

    if (member.email !== user.email.toLowerCase()) {
      throw new AppError('This invite was sent to a different email address', 403);
    }

    const existingMembership = await this.memberRepo.findActiveByUserId(userId);
    if (existingMembership) {
      throw new AppError('You already belong to an organization', 409);
    }

    await this.memberRepo.activate(member._id, userId);
    await this.userRepo.updateById(userId, { organizationId: member.organizationId });

    this.logger.info('Org invite accepted', {
      service: 'organization',
      orgId: member.organizationId,
      userId,
    });
  }

  async getMembers(userId) {
    const callerMembership = await this.memberRepo.findActiveByUserId(userId);
    if (!callerMembership) throw new AppError('You do not belong to an organization', 403);

    const members = await this.memberRepo.find(
      {
        organizationId: callerMembership.organizationId,
        status: { $ne: 'revoked' },
      },
      { populate: { path: 'userId', select: 'name email' } }
    );

    return members;
  }

  async removeMember(userId, memberId) {
    const callerMembership = await this.memberRepo.findActiveByUserId(userId);
    if (!callerMembership || callerMembership.role !== 'org_admin') {
      throw new AppError('Only org admins can remove members', 403);
    }

    const target = await this.memberRepo.findById(memberId);
    if (
      !target ||
      target.organizationId.toString() !== callerMembership.organizationId.toString()
    ) {
      throw new AppError('Member not found', 404);
    }

    if (target.userId?.toString() === userId) {
      const adminCount = await this.memberRepo.count({
        organizationId: callerMembership.organizationId,
        role: 'org_admin',
        status: 'active',
      });
      if (adminCount <= 1) {
        throw new AppError('Cannot remove the only org admin', 400);
      }
    }

    await this.memberRepo.revokeMembership(memberId);

    this.logger.info('Org member removed', {
      service: 'organization',
      memberId,
      removedBy: userId,
    });
  }
}

export const organizationService = new OrganizationService();
export { OrganizationService };
