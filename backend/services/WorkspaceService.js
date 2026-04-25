import { AppError } from '../utils/index.js';
import { Workspace } from '../models/Workspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { OrganizationMember } from '../models/OrganizationMember.js';
import { User } from '../models/User.js';
import logger from '../config/logger.js';
import { emailService } from './emailService.js';

export function serializeWorkspace(ws, extras = {}) {
  return {
    id: ws._id.toString(),
    name: ws.name,
    description: ws.description,
    syncStatus: ws.syncStatus,
    vendorTier: ws.vendorTier,
    serviceType: ws.serviceType,
    country: ws.country,
    contractStart: ws.contractStart,
    contractEnd: ws.contractEnd,
    nextReviewDate: ws.nextReviewDate,
    vendorStatus: ws.vendorStatus,
    certifications: ws.certifications,
    vendorFunctions: ws.vendorFunctions,
    exitStrategyDoc: ws.exitStrategyDoc,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
    ...extras,
  };
}

class WorkspaceService {
  constructor(deps = {}) {
    this.Workspace = deps.Workspace || Workspace;
    this.WorkspaceMember = deps.WorkspaceMember || WorkspaceMember;
    this.OrganizationMember = deps.OrganizationMember || OrganizationMember;
    this.User = deps.User || User;
    this.logger = deps.logger || logger;
    this.emailService = deps.emailService || emailService;
  }

  async createWorkspace(userId, data) {
    const {
      name,
      description,
      vendorTier,
      serviceType,
      country,
      contractStart,
      contractEnd,
      vendorFunctions,
    } = data;

    const orgMembership = await this.OrganizationMember.findOne({ userId, status: 'active' });

    const workspace = await this.Workspace.create({
      name: name.trim(),
      description: description?.trim() || '',
      userId,
      organizationId: orgMembership?.organizationId || null,
      vendorTier: vendorTier || null,
      serviceType: serviceType || null,
      country: country?.trim() || '',
      contractStart: contractStart || null,
      contractEnd: contractEnd || null,
      vendorFunctions: Array.isArray(vendorFunctions) ? vendorFunctions : [],
    });

    await this.WorkspaceMember.addOwner(workspace._id, userId);

    this.User.updateOne(
      { _id: userId, 'onboardingChecklist.vendorCreated': false },
      { $set: { 'onboardingChecklist.vendorCreated': true } }
    ).catch(() => {});

    this.logger.info('Workspace created', {
      service: 'workspace',
      workspaceId: workspace._id,
      userId,
    });

    return serializeWorkspace(workspace);
  }

  async getWorkspace(workspaceId, userId) {
    const membership = await this.WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    });
    if (!membership) throw new AppError('You are not a member of this workspace', 403);

    const workspace = await this.Workspace.findById(workspaceId);
    if (!workspace) throw new AppError('Workspace not found', 404);

    return serializeWorkspace(workspace, {
      myRole: membership.role,
      permissions: membership.permissions,
    });
  }

  async updateWorkspace(workspaceId, userId, data) {
    const membership = await this.WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
      role: 'owner',
    });
    if (!membership) throw new AppError('Only workspace owners can update workspace details', 403);

    const workspace = await this.Workspace.findById(workspaceId);
    if (!workspace) throw new AppError('Workspace not found', 404);

    const {
      name,
      description,
      vendorTier,
      country,
      serviceType,
      contractStart,
      contractEnd,
      nextReviewDate,
      vendorStatus,
      certifications,
      exitStrategyDoc,
      vendorFunctions,
    } = data;

    if (name?.trim()) workspace.name = name.trim();
    if (description !== undefined) workspace.description = description?.trim() || '';
    if (vendorTier !== undefined) workspace.vendorTier = vendorTier || null;
    if (country !== undefined) workspace.country = country?.trim() || '';
    if (serviceType !== undefined) workspace.serviceType = serviceType || null;
    if (contractStart !== undefined)
      workspace.contractStart = contractStart ? new Date(contractStart) : null;
    if (contractEnd !== undefined)
      workspace.contractEnd = contractEnd ? new Date(contractEnd) : null;
    if (nextReviewDate !== undefined)
      workspace.nextReviewDate = nextReviewDate ? new Date(nextReviewDate) : null;
    if (vendorStatus !== undefined) workspace.vendorStatus = vendorStatus;
    if (Array.isArray(certifications)) workspace.certifications = certifications;
    if (Array.isArray(vendorFunctions)) workspace.vendorFunctions = vendorFunctions;
    if (exitStrategyDoc !== undefined) workspace.exitStrategyDoc = exitStrategyDoc || null;

    await workspace.save();

    return serializeWorkspace(workspace);
  }

  async deleteWorkspace(workspaceId, userId) {
    const membership = await this.WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
      role: 'owner',
    });
    if (!membership) throw new AppError('Only workspace owners can delete a workspace', 403);

    await this.WorkspaceMember.deleteMany({ workspaceId });
    await this.Workspace.findByIdAndDelete(workspaceId);

    this.logger.info('Workspace deleted', { service: 'workspace', workspaceId });
  }

  async getMyWorkspaces(userId) {
    const orgMembership = await this.OrganizationMember.findOne({ userId, status: 'active' });

    if (orgMembership) {
      const orgWorkspaces = await this.Workspace.find({
        organizationId: orgMembership.organizationId,
      });
      const roleMap = { org_admin: 'owner', analyst: 'member', viewer: 'viewer' };
      const myRole = roleMap[orgMembership.role] || 'member';
      const canInvite = orgMembership.role === 'org_admin';
      return orgWorkspaces.map((ws) =>
        serializeWorkspace(ws, {
          myRole,
          permissions: { canQuery: true, canViewSources: true, canInvite },
          joinedAt: orgMembership.joinedAt,
        })
      );
    }

    const memberships = await this.WorkspaceMember.getUserWorkspaces(userId);
    return memberships
      .filter((m) => m.workspaceId)
      .map((m) =>
        serializeWorkspace(m.workspaceId, {
          myRole: m.role,
          permissions: m.permissions,
          joinedAt: m.invitedAt,
        })
      );
  }

  async getWorkspaceMembers(workspaceId, userId) {
    const requesterMembership = await this.WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    });
    if (!requesterMembership) throw new AppError('You are not a member of this workspace', 403);

    const members = await this.WorkspaceMember.getWorkspaceMembers(workspaceId);
    return members.map((m) => ({
      id: m._id.toString(),
      userId: m.userId?._id?.toString(),
      user: m.userId
        ? { id: m.userId._id.toString(), name: m.userId.name, email: m.userId.email }
        : null,
      role: m.role,
      status: m.status,
      permissions: m.permissions,
      joinedAt: m.invitedAt,
    }));
  }

  async inviteMember(workspaceId, inviterId, { email, role = 'member' }) {
    const userToInvite = await this.User.findOne({ email: email.toLowerCase() });
    if (!userToInvite) throw new AppError('User not found. They must register first.', 404);

    const inviterMembership = await this.WorkspaceMember.findOne({
      workspaceId,
      userId: inviterId,
      status: 'active',
    });
    if (!inviterMembership) throw new AppError('You are not a member of this workspace', 403);

    if (inviterMembership.role !== 'owner' && !inviterMembership.permissions.canInvite) {
      throw new AppError('You do not have permission to invite members', 403);
    }

    const workspace = await this.Workspace.findById(workspaceId);
    if (!workspace) throw new AppError('Workspace not found', 404);

    let membership;
    try {
      membership = await this.WorkspaceMember.inviteMember(
        workspaceId,
        userToInvite._id,
        inviterId,
        role
      );
    } catch (err) {
      if (err.message.includes('already a member')) {
        throw new AppError('User is already a member of this workspace', 409);
      }
      throw err;
    }

    const inviter = await this.User.findById(inviterId).select('name email');

    this.logger.info('User invited to workspace', {
      service: 'workspace-member',
      workspaceId,
      invitedUserId: userToInvite._id,
      invitedBy: inviterId,
      role,
    });

    this.emailService
      .sendWorkspaceInvitation({
        toEmail: userToInvite.email,
        toName: userToInvite.name,
        inviterName: inviter?.name || inviter?.email || 'A team member',
        workspaceName: workspace.name,
        workspaceId: workspace._id.toString(),
        role,
      })
      .catch((err) => {
        this.logger.error('Invitation email error', {
          service: 'workspace-member',
          error: err.message,
        });
      });

    return {
      membership: {
        id: membership._id,
        userId: userToInvite._id,
        email: userToInvite.email,
        name: userToInvite.name,
        role: membership.role,
        status: membership.status,
      },
      inviteeName: userToInvite.name || email,
      workspaceName: workspace.name,
    };
  }

  async revokeMember(workspaceId, requesterId, memberId) {
    const requesterMembership = await this.WorkspaceMember.findOne({
      workspaceId,
      userId: requesterId,
      status: 'active',
      role: 'owner',
    });
    if (!requesterMembership) throw new AppError('Only workspace owners can revoke access', 403);

    const memberToRevoke = await this.WorkspaceMember.findById(memberId);
    if (!memberToRevoke || memberToRevoke.workspaceId.toString() !== workspaceId) {
      throw new AppError('Member not found', 404);
    }
    if (memberToRevoke.role === 'owner') throw new AppError('Cannot revoke owner access', 400);

    memberToRevoke.status = 'revoked';
    await memberToRevoke.save();

    this.logger.info('User access revoked from workspace', {
      service: 'workspace-member',
      workspaceId,
      revokedUserId: memberToRevoke.userId,
      revokedBy: requesterId,
    });
  }

  async updateMember(workspaceId, requesterId, memberId, { role, permissions } = {}) {
    const requesterMembership = await this.WorkspaceMember.findOne({
      workspaceId,
      userId: requesterId,
      status: 'active',
      role: 'owner',
    });
    if (!requesterMembership)
      throw new AppError('Only workspace owners can update member permissions', 403);

    const member = await this.WorkspaceMember.findById(memberId);
    if (!member || member.workspaceId.toString() !== workspaceId) {
      throw new AppError('Member not found', 404);
    }
    if (member.role === 'owner') throw new AppError('Cannot modify owner permissions', 400);

    if (role && ['member', 'viewer'].includes(role)) member.role = role;

    if (permissions) {
      member.permissions = {
        ...member.permissions,
        ...permissions,
        canInvite: permissions.canInvite === true && role !== 'viewer',
      };
    }

    await member.save();

    this.logger.info('Member permissions updated', {
      service: 'workspace-member',
      workspaceId,
      memberId,
      updatedBy: requesterId,
    });

    return member;
  }
}

export const workspaceService = new WorkspaceService();
export { WorkspaceService };
