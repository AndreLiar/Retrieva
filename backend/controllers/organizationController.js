/**
 * Organization Controller
 *
 * Thin HTTP layer for org creation, membership, and invite flows.
 * All business logic lives in services/OrganizationService.js.
 */

import { organizationService } from '../services/OrganizationService.js';
import { catchAsync, sendSuccess } from '../utils/index.js';
import { safeDecrypt } from '../utils/security/fieldEncryption.js';

/**
 * POST /api/v1/organizations
 */
export const createOrganization = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { name, industry, country } = req.body;

  const { org, billingFields } = await organizationService.createOrganization(userId, {
    name,
    industry,
    country,
  });

  sendSuccess(res, 201, 'Organization created', {
    organization: {
      id: org._id,
      name: org.name,
      industry: org.industry,
      country: org.country,
      plan: billingFields.plan,
      planStatus: billingFields.planStatus,
      trialEndsAt: billingFields.trialEndsAt,
    },
  });
});

/**
 * GET /api/v1/organizations/me
 */
export const getMyOrganization = catchAsync(async (req, res) => {
  const { organization, role } = await organizationService.getMyOrganization(
    req.user.userId
  );

  if (!organization) {
    return sendSuccess(res, 200, 'No organization', { organization: null, role: null });
  }

  sendSuccess(res, 200, 'Organization retrieved', {
    organization: {
      id: organization._id,
      name: organization.name,
      industry: organization.industry,
      country: organization.country,
      plan: organization.plan || 'starter',
      planStatus: organization.planStatus || 'trialing',
      trialEndsAt: organization.trialEndsAt || null,
    },
    role,
  });
});

/**
 * GET /api/v1/organizations/invite-info?token=XXX  (PUBLIC — no auth)
 */
export const getInviteInfo = catchAsync(async (req, res) => {
  const info = await organizationService.getInviteInfo(req.query.token);
  sendSuccess(res, 200, 'Invite info retrieved', info);
});

/**
 * POST /api/v1/organizations/invite
 */
export const inviteMember = catchAsync(async (req, res) => {
  const inviterId = req.user.userId;
  const { email, role = 'analyst' } = req.body;

  const member = await organizationService.inviteMember(inviterId, { email, role });

  sendSuccess(res, 201, 'Invitation sent', {
    member: {
      id: member._id,
      email: member.email,
      role: member.role,
      status: member.status,
    },
  });
});

/**
 * POST /api/v1/organizations/accept-invite  (authenticated)
 */
export const acceptInvite = catchAsync(async (req, res) => {
  await organizationService.acceptInvite(req.user.userId, req.body.token);
  sendSuccess(res, 200, 'Invitation accepted');
});

/**
 * GET /api/v1/organizations/members
 */
export const getMembers = catchAsync(async (req, res) => {
  const members = await organizationService.getMembers(req.user.userId);

  const memberList = members.map((m) => ({
    id: m._id.toString(),
    email: m.email,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    user: m.userId
      ? {
          id: m.userId._id.toString(),
          name: safeDecrypt(m.userId.name),
          email: m.userId.email,
        }
      : null,
  }));

  sendSuccess(res, 200, 'Members retrieved', { members: memberList });
});

/**
 * DELETE /api/v1/organizations/members/:memberId
 */
export const removeMember = catchAsync(async (req, res) => {
  await organizationService.removeMember(req.user.userId, req.params.memberId);
  sendSuccess(res, 200, 'Member removed');
});
