/**
 * Organization Controller
 *
 * CRUD for organizations, member management, and workspace linking.
 */

import { Organization } from '../models/Organization.js';
import { OrganizationMember } from '../models/OrganizationMember.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { User } from '../models/User.js';
import { emailService } from '../services/emailService.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import logger from '../config/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a URL-safe slug from a name.
 * Lowercases, replaces spaces with hyphens, strips non-alphanumeric characters.
 */
function nameToSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

/**
 * Ensure slug is unique; append 4-digit timestamp suffix on collision.
 */
async function ensureUniqueSlug(baseSlug, excludeId = null) {
  const query = { slug: baseSlug };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await Organization.findOne(query);
  if (!existing) return baseSlug;
  return `${baseSlug}-${Date.now().toString().slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Organization CRUD
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/organizations
 */
export const createOrg = catchAsync(async (req, res) => {
  const { name, description, logoUrl } = req.body;

  if (!name || !name.trim()) {
    return sendError(res, 400, 'Organization name is required');
  }

  const baseSlug = nameToSlug(name);
  const slug = await ensureUniqueSlug(baseSlug);

  const org = await Organization.create({
    name: name.trim(),
    slug,
    description,
    logoUrl,
    ownerId: req.user.userId,
  });

  await OrganizationMember.addOwner(org._id, req.user.userId);

  logger.info('Organization created', {
    service: 'organization',
    orgId: org._id,
    userId: req.user.userId,
  });

  sendSuccess(res, 201, 'Organization created', { organization: org });
});

/**
 * GET /api/v1/organizations
 */
export const listOrgs = catchAsync(async (req, res) => {
  const memberships = await OrganizationMember.find({
    userId: req.user.userId,
    status: 'active',
  }).populate('organizationId');

  const orgs = memberships
    .filter((m) => m.organizationId)
    .map((m) => ({
      org: m.organizationId,
      role: m.role,
    }));

  sendSuccess(res, 200, 'Organizations retrieved', { organizations: orgs });
});

/**
 * GET /api/v1/organizations/:id
 * requireOrgAccess attaches req.organization
 */
export const getOrg = catchAsync(async (req, res) => {
  const org = req.organization;

  const [memberCount, workspaceCount] = await Promise.all([
    OrganizationMember.countDocuments({ organizationId: org._id, status: { $ne: 'revoked' } }),
    NotionWorkspace.countDocuments({ organizationId: org._id }),
  ]);

  sendSuccess(res, 200, 'Organization retrieved', {
    organization: { ...org.toObject(), memberCount, workspaceCount },
  });
});

/**
 * PATCH /api/v1/organizations/:id
 * requireOrgAdmin
 */
export const updateOrg = catchAsync(async (req, res) => {
  const org = req.organization;
  const { name, description, logoUrl, settings } = req.body;

  if (name !== undefined) {
    org.name = name.trim();
    const baseSlug = nameToSlug(name);
    org.slug = await ensureUniqueSlug(baseSlug, org._id);
  }
  if (description !== undefined) org.description = description;
  if (logoUrl !== undefined) org.logoUrl = logoUrl;
  if (settings) {
    org.settings = { ...org.settings, ...settings };
  }

  await org.save();

  sendSuccess(res, 200, 'Organization updated', { organization: org });
});

/**
 * DELETE /api/v1/organizations/:id
 * requireOrgOwner
 */
export const deleteOrg = catchAsync(async (req, res) => {
  const org = req.organization;

  await Promise.all([
    OrganizationMember.deleteMany({ organizationId: org._id }),
    NotionWorkspace.updateMany({ organizationId: org._id }, { $unset: { organizationId: 1 } }),
  ]);

  await Organization.deleteOne({ _id: org._id });

  logger.info('Organization deleted', {
    service: 'organization',
    orgId: org._id,
    deletedBy: req.user.userId,
  });

  sendSuccess(res, 200, 'Organization deleted');
});

// ---------------------------------------------------------------------------
// Member Management
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/organizations/:id/members
 */
export const getOrgMembers = catchAsync(async (req, res) => {
  const members = await OrganizationMember.getOrgMembers(req.organization._id);

  const memberList = members.map((m) => ({
    id: m._id.toString(),
    organizationId: m.organizationId.toString(),
    userId: m.userId?._id?.toString(),
    user: m.userId
      ? {
          id: m.userId._id.toString(),
          name: m.userId.name,
          email: m.userId.email,
        }
      : null,
    role: m.role,
    status: m.status,
  }));

  sendSuccess(res, 200, 'Members retrieved', { members: memberList });
});

/**
 * POST /api/v1/organizations/:id/invite
 */
export const inviteOrgMember = catchAsync(async (req, res) => {
  const { email, role = 'member' } = req.body;
  const org = req.organization;

  if (!email) {
    return sendError(res, 400, 'Email is required');
  }

  const validRoles = ['org-admin', 'billing-admin', 'auditor', 'member'];
  if (!validRoles.includes(role)) {
    return sendError(res, 400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  const userToInvite = await User.findOne({ email: email.toLowerCase() });
  if (!userToInvite) {
    return sendError(res, 404, 'User not found. They must register first.');
  }

  // Enforce seat limit
  const currentCount = await OrganizationMember.countDocuments({
    organizationId: org._id,
    status: { $ne: 'revoked' },
  });
  if (currentCount >= org.settings.maxMembers) {
    return sendError(
      res,
      403,
      `Organization has reached its member limit (${org.settings.maxMembers})`
    );
  }

  let membership;
  try {
    membership = await OrganizationMember.inviteMember(
      org._id,
      userToInvite._id,
      req.user.userId,
      role
    );
  } catch (error) {
    if (error.message.includes('already a member')) {
      return sendError(res, 409, 'User is already a member of this organization');
    }
    throw error;
  }

  // Send invitation email (async, non-blocking)
  emailService
    .sendWorkspaceInvitation({
      toEmail: userToInvite.email,
      toName: userToInvite.name,
      inviterName: req.user.name || req.user.email || 'An admin',
      workspaceName: org.name,
      workspaceId: org._id.toString(),
      role,
    })
    .catch((err) => {
      logger.error('Failed to send org invitation email', {
        service: 'organization',
        error: err.message,
      });
    });

  logger.info('User invited to organization', {
    service: 'organization',
    orgId: org._id,
    invitedUserId: userToInvite._id,
    role,
  });

  sendSuccess(res, 201, `${userToInvite.name || email} has been invited to ${org.name}`, {
    membership: {
      id: membership._id,
      userId: userToInvite._id,
      email: userToInvite.email,
      name: userToInvite.name,
      role: membership.role,
      status: membership.status,
    },
  });
});

/**
 * PATCH /api/v1/organizations/:id/members/:memberId
 */
export const updateOrgMember = catchAsync(async (req, res) => {
  const { memberId } = req.params;
  const { role } = req.body;
  const org = req.organization;

  const validRoles = ['org-admin', 'billing-admin', 'auditor', 'member'];
  if (!role || !validRoles.includes(role)) {
    return sendError(res, 400, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  const member = await OrganizationMember.findOne({
    _id: memberId,
    organizationId: org._id,
  });
  if (!member) {
    return sendError(res, 404, 'Member not found');
  }

  // Prevent changing the org owner's role via this endpoint
  if (member.userId.toString() === org.ownerId.toString()) {
    return sendError(res, 400, 'Cannot change the role of the organization owner');
  }

  member.role = role;
  await member.save();

  sendSuccess(res, 200, 'Member role updated', { member });
});

/**
 * DELETE /api/v1/organizations/:id/members/:memberId
 */
export const removeOrgMember = catchAsync(async (req, res) => {
  const { memberId } = req.params;
  const org = req.organization;

  const member = await OrganizationMember.findOne({
    _id: memberId,
    organizationId: org._id,
  });
  if (!member) {
    return sendError(res, 404, 'Member not found');
  }

  if (member.userId.toString() === org.ownerId.toString()) {
    return sendError(res, 400, 'Cannot remove the organization owner');
  }

  await OrganizationMember.removeMember(org._id, member.userId);

  sendSuccess(res, 200, 'Member removed');
});

// ---------------------------------------------------------------------------
// Workspace Linking
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/organizations/:id/workspaces
 */
export const getOrgWorkspaces = catchAsync(async (req, res) => {
  const workspaces = await NotionWorkspace.find({ organizationId: req.organization._id }).select(
    'workspaceName workspaceIcon syncStatus stats createdAt'
  );

  sendSuccess(res, 200, 'Workspaces retrieved', { workspaces });
});

/**
 * POST /api/v1/organizations/:id/workspaces
 * Body: { workspaceId }
 */
export const linkWorkspace = catchAsync(async (req, res) => {
  const { workspaceId } = req.body;
  const org = req.organization;

  if (!workspaceId) {
    return sendError(res, 400, 'workspaceId is required');
  }

  const workspace = await NotionWorkspace.findById(workspaceId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  // Verify the workspace belongs to a user who is an org member
  const memberIds = await OrganizationMember.find({
    organizationId: org._id,
    status: 'active',
  }).distinct('userId');

  if (!memberIds.some((id) => id.toString() === workspace.userId?.toString())) {
    return sendError(res, 403, 'Workspace does not belong to a member of this organization');
  }

  // Check workspace limit
  const linkedCount = await NotionWorkspace.countDocuments({ organizationId: org._id });
  if (linkedCount >= org.settings.maxWorkspaces) {
    return sendError(
      res,
      403,
      `Organization has reached its workspace limit (${org.settings.maxWorkspaces})`
    );
  }

  await NotionWorkspace.findByIdAndUpdate(workspaceId, { organizationId: org._id });

  sendSuccess(res, 200, 'Workspace linked to organization');
});

/**
 * DELETE /api/v1/organizations/:id/workspaces/:wsId
 */
export const unlinkWorkspace = catchAsync(async (req, res) => {
  const { wsId } = req.params;

  const workspace = await NotionWorkspace.findOne({
    _id: wsId,
    organizationId: req.organization._id,
  });
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found or not linked to this organization');
  }

  await NotionWorkspace.findByIdAndUpdate(wsId, { $unset: { organizationId: 1 } });

  sendSuccess(res, 200, 'Workspace unlinked from organization');
});
