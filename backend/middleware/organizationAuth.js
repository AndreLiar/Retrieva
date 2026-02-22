/**
 * Organization Authorization Middleware
 *
 * Guards organization routes by verifying membership and role.
 */

import { Organization } from '../models/Organization.js';
import { OrganizationMember } from '../models/OrganizationMember.js';
import { catchAsync, AppError } from '../utils/index.js';

/**
 * Require active membership in the organization.
 * Attaches `req.organization` for downstream handlers.
 */
export const requireOrgAccess = catchAsync(async (req, res, next) => {
  const org = await Organization.findById(req.params.id);
  if (!org || org.status === 'suspended') {
    throw new AppError('Organization not found', 404);
  }
  const hasAccess = await OrganizationMember.hasAccess(req.user.userId, org._id);
  if (!hasAccess) {
    throw new AppError('Not a member of this organization', 403);
  }
  req.organization = org;
  next();
});

/**
 * Require org-admin role.
 * Runs requireOrgAccess first, then checks role.
 */
export const requireOrgAdmin = catchAsync(async (req, res, next) => {
  await requireOrgAccess(req, res, async () => {
    const isAdmin = await OrganizationMember.hasRole(
      req.user.userId,
      req.organization._id,
      'org-admin'
    );
    if (!isAdmin) {
      throw new AppError('Organization admin access required', 403);
    }
    next();
  });
});

/**
 * Require ownership of the organization (ownerId matches caller).
 * Runs requireOrgAccess first, then checks ownerId.
 */
export const requireOrgOwner = catchAsync(async (req, res, next) => {
  await requireOrgAccess(req, res, async () => {
    if (req.organization.ownerId.toString() !== req.user.userId.toString()) {
      throw new AppError('Only the organization owner can perform this action', 403);
    }
    next();
  });
});
