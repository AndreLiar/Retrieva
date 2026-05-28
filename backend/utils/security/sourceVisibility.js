/**
 * Source visibility (audit gap B1)
 *
 * WorkspaceMember carries a fine-grained `permissions.canViewSources` flag, but
 * it was never enforced — retrieval sources were always returned. This helper
 * resolves the flag for the current request so controllers can strip sources
 * when a member is not allowed to see them.
 *
 * Fail-open: when the workspace can't be resolved, or no membership row is
 * found, we return true — matching the WorkspaceMember model default
 * (canViewSources: true). Only an explicit `false` strips sources.
 */

import { workspaceMemberRepository } from '../../repositories/WorkspaceMemberRepository.js';

/**
 * @param {import('express').Request} req - request (may carry req.authorizedWorkspaces)
 * @param {string|import('mongoose').Types.ObjectId} workspaceId - target workspace
 * @returns {Promise<boolean>} whether sources may be returned to this user
 */
export async function userCanViewSources(req, workspaceId) {
  if (!workspaceId) return true;
  const wsId = workspaceId.toString();

  // requireWorkspaceAccess (RAG routes) already loaded memberships + permissions.
  const loaded = req.authorizedWorkspaces?.find((w) => w.workspaceId === wsId);
  if (loaded) return loaded.permissions?.canViewSources !== false;

  // Conversation routes only run `authenticate`, so look the membership up.
  const userId = req.user?.userId;
  if (!userId) return true;

  const membership = await workspaceMemberRepository.findMembership(wsId, userId);
  return membership ? membership.permissions?.canViewSources !== false : true;
}
