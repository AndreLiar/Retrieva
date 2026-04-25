import { catchAsync, sendSuccess } from '../utils/index.js';
import { workspaceService } from '../services/WorkspaceService.js';

export const createWorkspace = catchAsync(async (req, res) => {
  const workspace = await workspaceService.createWorkspace(req.user.userId, req.body);
  sendSuccess(res, 201, 'Workspace created', { workspace });
});

export const getWorkspace = catchAsync(async (req, res) => {
  const workspace = await workspaceService.getWorkspace(req.params.workspaceId, req.user.userId);
  sendSuccess(res, 200, 'Workspace retrieved', { workspace });
});

export const updateWorkspace = catchAsync(async (req, res) => {
  const workspace = await workspaceService.updateWorkspace(
    req.params.workspaceId,
    req.user.userId,
    req.body
  );
  sendSuccess(res, 200, 'Workspace updated', { workspace });
});

export const deleteWorkspace = catchAsync(async (req, res) => {
  await workspaceService.deleteWorkspace(req.params.workspaceId, req.user.userId);
  sendSuccess(res, 200, 'Workspace deleted');
});

export const getMyWorkspaces = catchAsync(async (req, res) => {
  const workspaces = await workspaceService.getMyWorkspaces(req.user.userId);
  sendSuccess(res, 200, 'Workspaces retrieved', { workspaces });
});

export const getWorkspaceMembers = catchAsync(async (req, res) => {
  const members = await workspaceService.getWorkspaceMembers(
    req.params.workspaceId,
    req.user.userId
  );
  sendSuccess(res, 200, 'Members retrieved', { members });
});

export const inviteMember = catchAsync(async (req, res) => {
  const result = await workspaceService.inviteMember(
    req.params.workspaceId,
    req.user.userId,
    req.body
  );
  sendSuccess(res, 201, `${result.inviteeName} has been invited to ${result.workspaceName}`, {
    membership: result.membership,
  });
});

export const revokeMember = catchAsync(async (req, res) => {
  await workspaceService.revokeMember(req.params.workspaceId, req.user.userId, req.params.memberId);
  sendSuccess(res, 200, 'Access revoked successfully');
});

export const updateMember = catchAsync(async (req, res) => {
  const member = await workspaceService.updateMember(
    req.params.workspaceId,
    req.user.userId,
    req.params.memberId,
    req.body
  );
  sendSuccess(res, 200, 'Member updated successfully', { member });
});
