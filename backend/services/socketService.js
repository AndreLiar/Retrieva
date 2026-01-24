/**
 * Socket.io Service
 *
 * Real-time WebSocket server with JWT authentication
 * Handles:
 * - Connection management with JWT auth
 * - Room management (user rooms, workspace rooms)
 * - Event broadcasting
 * - Reconnection handling with offline queue
 *
 * @module services/socketService
 */

import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/security/jwt.js';
import { User } from '../models/User.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import * as presenceService from './presenceService.js';
import * as liveAnalyticsService from './liveAnalyticsService.js';
import logger from '../config/logger.js';

/**
 * @typedef {Object} AuthenticatedSocket
 * @property {Object} user - Authenticated user data
 * @property {string} user.userId - User's MongoDB ID
 * @property {string} user.email - User's email
 * @property {string} user.name - User's name
 * @property {string[]} user.workspaceIds - User's workspace IDs
 */

// Socket.io server instance
let io = null;

// Connected users map: userId -> Set of socket IDs
const connectedUsers = new Map();

// Offline message queue: userId -> Array of queued events
const offlineQueue = new Map();

// Maximum offline queue size per user
const MAX_QUEUE_SIZE = 100;

/**
 * Initialize Socket.io server
 *
 * @param {import('http').Server} httpServer - HTTP server instance
 * @returns {Server} Socket.io server instance
 */
export function initializeSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      // Get token from auth header or query param
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        extractTokenFromCookie(socket.handshake.headers.cookie);

      if (!token) {
        logger.warn('Socket connection rejected - no token', {
          service: 'socket',
          socketId: socket.id,
        });
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const decoded = verifyAccessToken(token);

      // Get user from database
      const user = await User.findById(decoded.userId).select('name email');
      if (!user) {
        return next(new Error('User not found'));
      }

      if (!user.isActive) {
        return next(new Error('Account is inactive'));
      }

      // Get user's workspaces
      const memberships = await WorkspaceMember.find({
        userId: decoded.userId,
        status: 'active',
      }).select('workspaceId');

      const workspaceIds = memberships.map((m) => m.workspaceId.toString());

      // Attach user info to socket
      socket.user = {
        userId: decoded.userId.toString(),
        email: user.email,
        name: user.name,
        workspaceIds,
      };

      logger.debug('Socket authenticated', {
        service: 'socket',
        userId: socket.user.userId,
        socketId: socket.id,
      });

      next();
    } catch (error) {
      logger.warn('Socket authentication failed', {
        service: 'socket',
        error: error.message,
        socketId: socket.id,
      });
      next(new Error(error.message || 'Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', handleConnection);

  logger.info('Socket.io server initialized', { service: 'socket' });

  return io;
}

/**
 * Handle new socket connection
 *
 * @param {AuthenticatedSocket} socket - Authenticated socket instance
 */
function handleConnection(socket) {
  const { userId, email, workspaceIds } = socket.user;

  logger.info('Client connected', {
    service: 'socket',
    userId,
    email,
    socketId: socket.id,
    workspaces: workspaceIds.length,
  });

  // Track connected user
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set());
  }
  connectedUsers.get(userId).add(socket.id);

  // Register with presence service
  presenceService.userConnected(userId, socket.id, {
    name: socket.user.name,
    email: socket.user.email,
  });

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Join all workspace rooms
  workspaceIds.forEach((workspaceId) => {
    socket.join(`workspace:${workspaceId}`);
  });

  // Deliver any queued offline messages
  deliverOfflineQueue(socket);

  // Emit connection success
  socket.emit('connected', {
    userId,
    workspaces: workspaceIds,
    timestamp: new Date().toISOString(),
  });

  // Handle joining additional rooms (e.g., for specific queries)
  socket.on('join:query', (queryId) => {
    socket.join(`query:${queryId}`);
    logger.debug('Socket joined query room', {
      service: 'socket',
      userId,
      queryId,
    });
  });

  socket.on('leave:query', (queryId) => {
    socket.leave(`query:${queryId}`);
  });

  // Handle workspace room updates (when user joins new workspace)
  socket.on('join:workspace', async (workspaceId) => {
    // Verify user has access
    const membership = await WorkspaceMember.findOne({
      userId,
      workspaceId,
      status: 'active',
    });

    if (membership) {
      socket.join(`workspace:${workspaceId}`);
      socket.user.workspaceIds.push(workspaceId);
      logger.debug('Socket joined workspace room', {
        service: 'socket',
        userId,
        workspaceId,
      });
    }
  });

  // Handle ping for connection health
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // =========================================================================
  // Presence Events
  // =========================================================================

  // Handle joining a workspace (for presence tracking)
  socket.on('presence:join-workspace', async (workspaceId) => {
    // Verify user has access
    const membership = await WorkspaceMember.findOne({
      userId,
      workspaceId,
      status: 'active',
    });

    if (membership) {
      await presenceService.joinWorkspace(userId, workspaceId, {
        name: socket.user.name,
        email: socket.user.email,
      });

      // Send current presence state to user
      presenceService.syncPresenceToUser(userId, workspaceId);

      logger.debug('User joined workspace presence', {
        service: 'socket',
        userId,
        workspaceId,
      });
    }
  });

  // Handle leaving a workspace
  socket.on('presence:leave-workspace', (workspaceId) => {
    presenceService.leaveWorkspace(userId, workspaceId);
  });

  // Handle status update (online, away, busy)
  socket.on('presence:status', (status) => {
    if (Object.values(presenceService.UserStatus).includes(status)) {
      presenceService.updateUserStatus(userId, status);
    }
  });

  // Handle typing start
  socket.on('presence:typing-start', ({ workspaceId, conversationId }) => {
    presenceService.startTyping(userId, workspaceId, conversationId, socket.user.name);
  });

  // Handle typing stop
  socket.on('presence:typing-stop', ({ workspaceId, conversationId }) => {
    presenceService.stopTyping(userId, workspaceId, conversationId);
  });

  // Handle get workspace presence request
  socket.on('presence:get', (workspaceId) => {
    const presence = presenceService.getWorkspacePresence(workspaceId);
    socket.emit('presence:update', presence);
  });

  // =========================================================================
  // Analytics Events
  // =========================================================================

  // Subscribe to real-time analytics updates
  socket.on('analytics:subscribe', () => {
    liveAnalyticsService.subscribeToAnalytics(userId);
    logger.debug('User subscribed to analytics via WebSocket', { userId });
  });

  // Unsubscribe from analytics updates
  socket.on('analytics:unsubscribe', () => {
    liveAnalyticsService.unsubscribeFromAnalytics(userId);
    logger.debug('User unsubscribed from analytics via WebSocket', { userId });
  });

  // Request current analytics
  socket.on('analytics:get', async () => {
    try {
      const [queryMetrics, systemHealth] = await Promise.all([
        liveAnalyticsService.getCurrentQueryMetrics(),
        liveAnalyticsService.getSystemHealth(),
      ]);

      socket.emit('analytics:metrics-update', {
        queries: queryMetrics,
        health: systemHealth,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get analytics for socket', { error: error.message, userId });
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected', {
      service: 'socket',
      userId,
      socketId: socket.id,
      reason,
    });

    // Remove from connected users
    const userSockets = connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        connectedUsers.delete(userId);
      }
    }

    // Update presence service (handles workspace presence cleanup)
    const isFullyOffline = presenceService.userDisconnected(userId, socket.id);

    // If user is fully offline, clean up analytics subscription and emit to workspaces
    if (isFullyOffline) {
      liveAnalyticsService.unsubscribeFromAnalytics(userId);
      workspaceIds.forEach((workspaceId) => {
        io.to(`workspace:${workspaceId}`).emit('presence:offline', {
          userId,
          name: socket.user.name,
          timestamp: new Date().toISOString(),
        });
      });
    }
  });

  // Emit presence update to workspaces
  workspaceIds.forEach((workspaceId) => {
    socket.to(`workspace:${workspaceId}`).emit('presence:online', {
      userId,
      name: socket.user.name,
      timestamp: new Date().toISOString(),
    });
  });
}

/**
 * Extract token from cookie header
 *
 * @param {string} cookieHeader - Cookie header string
 * @returns {string|null} Access token or null
 */
function extractTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});

  return cookies.accessToken || null;
}

/**
 * Deliver queued offline messages to reconnected user
 *
 * @param {AuthenticatedSocket} socket - Authenticated socket
 */
function deliverOfflineQueue(socket) {
  const { userId } = socket.user;
  const queue = offlineQueue.get(userId);

  if (queue && queue.length > 0) {
    logger.info('Delivering offline queue', {
      service: 'socket',
      userId,
      queueSize: queue.length,
    });

    queue.forEach(({ event, data }) => {
      socket.emit(event, { ...data, wasQueued: true });
    });

    offlineQueue.delete(userId);
  }
}

/**
 * Queue message for offline user
 *
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function queueOfflineMessage(userId, event, data) {
  if (!offlineQueue.has(userId)) {
    offlineQueue.set(userId, []);
  }

  const queue = offlineQueue.get(userId);

  // Limit queue size
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift(); // Remove oldest
  }

  queue.push({
    event,
    data: { ...data, queuedAt: new Date().toISOString() },
  });
}

/**
 * Check if user is currently connected
 *
 * @param {string} userId - User ID
 * @returns {boolean} True if user has active connections
 */
export function isUserOnline(userId) {
  return connectedUsers.has(userId) && connectedUsers.get(userId).size > 0;
}

/**
 * Get all online users in a workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @returns {string[]} Array of online user IDs
 */
export function getOnlineWorkspaceUsers(workspaceId) {
  const room = io?.sockets.adapter.rooms.get(`workspace:${workspaceId}`);
  if (!room) return [];

  const onlineUsers = new Set();
  room.forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket?.user?.userId) {
      onlineUsers.add(socket.user.userId);
    }
  });

  return Array.from(onlineUsers);
}

/**
 * Emit event to specific user
 *
 * @param {string} userId - Target user ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 * @param {boolean} [queueIfOffline=true] - Queue message if user is offline
 */
export function emitToUser(userId, event, data, queueIfOffline = true) {
  if (!io) {
    logger.warn('Socket.io not initialized', { service: 'socket' });
    return;
  }

  if (isUserOnline(userId)) {
    io.to(`user:${userId}`).emit(event, data);
    logger.debug('Emitted to user', {
      service: 'socket',
      userId,
      event,
    });
  } else if (queueIfOffline) {
    queueOfflineMessage(userId, event, data);
    logger.debug('Queued message for offline user', {
      service: 'socket',
      userId,
      event,
    });
  }
}

/**
 * Emit event to all users in a workspace
 *
 * @param {string} workspaceId - Target workspace ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export function emitToWorkspace(workspaceId, event, data) {
  if (!io) {
    logger.warn('Socket.io not initialized', { service: 'socket' });
    return;
  }

  io.to(`workspace:${workspaceId}`).emit(event, data);
  logger.debug('Emitted to workspace', {
    service: 'socket',
    workspaceId,
    event,
  });
}

/**
 * Emit event to a specific query room (for streaming)
 *
 * @param {string} queryId - Query ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export function emitToQuery(queryId, event, data) {
  if (!io) {
    logger.warn('Socket.io not initialized', { service: 'socket' });
    return;
  }

  io.to(`query:${queryId}`).emit(event, data);
}

/**
 * Broadcast event to all connected clients
 *
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export function broadcast(event, data) {
  if (!io) {
    logger.warn('Socket.io not initialized', { service: 'socket' });
    return;
  }

  io.emit(event, data);
}

/**
 * Get Socket.io server instance
 *
 * @returns {Server|null} Socket.io server or null if not initialized
 */
export function getIO() {
  return io;
}

/**
 * Get connection statistics
 *
 * @returns {Object} Connection stats
 */
export function getStats() {
  return {
    totalConnections: io?.sockets.sockets.size || 0,
    uniqueUsers: connectedUsers.size,
    offlineQueueSize: Array.from(offlineQueue.values()).reduce((sum, q) => sum + q.length, 0),
  };
}

// Export for use in other modules
export const socketService = {
  initializeSocketServer,
  emitToUser,
  emitToWorkspace,
  emitToQuery,
  broadcast,
  isUserOnline,
  getOnlineWorkspaceUsers,
  getIO,
  getStats,
};

export default socketService;
