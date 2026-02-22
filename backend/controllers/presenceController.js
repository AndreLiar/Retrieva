/**
 * Presence Controller
 *
 * Handles presence-related API endpoints:
 * - GET /presence/:workspaceId        — Get online users in workspace
 * - GET /presence/:workspaceId/count  — Get online count
 * - GET /presence/stats               — Get global presence stats
 * - GET /presence/:workspaceId/typing/:conversationId — Get typing users
 *
 * All presence read functions are now async (Redis when REALTIME_SERVICE_URL
 * is set, in-memory Maps otherwise).
 *
 * @module controllers/presenceController
 */

import { presenceService } from '../services/presenceService.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { getOnlineWorkspaceUsers } from '../services/socketService.js';
import logger from '../config/logger.js';

/**
 * Get online users in a workspace
 *
 * @route GET /api/v1/presence/:workspaceId
 */
export async function getWorkspacePresence(req, res) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.userId;

    // Check workspace membership
    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'Not a member of this workspace',
      });
    }

    // Both functions may return a Promise (Redis) or a plain value (in-memory)
    const [presence, socketOnlineUsers] = await Promise.all([
      Promise.resolve(presenceService.getWorkspacePresence(workspaceId)),
      Promise.resolve(getOnlineWorkspaceUsers(workspaceId)),
    ]);

    res.json({
      success: true,
      data: {
        workspaceId,
        onlineCount: presence.onlineCount,
        users: presence.users,
        socketConnectedCount: socketOnlineUsers.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get workspace presence', {
      controller: 'presence',
      error: error.message,
      workspaceId: req.params.workspaceId,
    });
    res.status(500).json({ success: false, error: 'Failed to get presence data' });
  }
}

/**
 * Get online count for a workspace
 *
 * @route GET /api/v1/presence/:workspaceId/count
 */
export async function getWorkspaceOnlineCount(req, res) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.userId;

    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'Not a member of this workspace',
      });
    }

    const onlineCount = await Promise.resolve(presenceService.getWorkspaceOnlineCount(workspaceId)); // may be Promise or number

    res.json({
      success: true,
      data: { workspaceId, onlineCount },
    });
  } catch (error) {
    logger.error('Failed to get online count', {
      controller: 'presence',
      error: error.message,
      workspaceId: req.params.workspaceId,
    });
    res.status(500).json({ success: false, error: 'Failed to get online count' });
  }
}

/**
 * Get global presence statistics (admin only)
 *
 * @route GET /api/v1/presence/stats
 */
export async function getPresenceStats(req, res) {
  try {
    const stats = await Promise.resolve(presenceService.getPresenceStats());

    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Failed to get presence stats', {
      controller: 'presence',
      error: error.message,
    });
    res.status(500).json({ success: false, error: 'Failed to get presence statistics' });
  }
}

/**
 * Get typing users in a conversation
 *
 * @route GET /api/v1/presence/:workspaceId/typing/:conversationId
 */
export async function getTypingUsers(req, res) {
  try {
    const { workspaceId, conversationId } = req.params;
    const userId = req.user.userId;

    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'Not a member of this workspace',
      });
    }

    const typingUsers = await Promise.resolve(
      presenceService.getTypingUsers(workspaceId, conversationId)
    );

    res.json({
      success: true,
      data: { workspaceId, conversationId, typingUsers },
    });
  } catch (error) {
    logger.error('Failed to get typing users', {
      controller: 'presence',
      error: error.message,
    });
    res.status(500).json({ success: false, error: 'Failed to get typing users' });
  }
}

export const presenceController = {
  getWorkspacePresence,
  getWorkspaceOnlineCount,
  getPresenceStats,
  getTypingUsers,
};

export default presenceController;
