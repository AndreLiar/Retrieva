import { Server } from 'socket.io';
import { VALID_STATUSES } from '../../domain/UserStatus.js';

function extractTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key) acc[key.trim()] = value?.trim();
    return acc;
  }, {});
  return cookies.accessToken || null;
}

// Returns io configured with auth middleware + all event handlers
// dbLookup is optional: async ({ userId }) => { name, email, workspaceIds } | null
export function createSocketServer(httpServer, {
  frontendUrl,
  tokenVerifier,         // ITokenVerifier
  presenceService,       // PresenceApplicationService
  offlineQueueService,   // OfflineQueueService
  dbLookup = null,       // optional async fn
}) {
  const io = new Server(httpServer, {
    cors: { origin: frontendUrl, methods: ['GET', 'POST'], credentials: true },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Auth middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        extractTokenFromCookie(socket.handshake.headers.cookie);

      if (!token) return next(new Error('Authentication required'));

      const decoded = tokenVerifier.verify(token);

      let userName = 'Unknown', userEmail = '', workspaceIds = [];
      if (dbLookup) {
        const result = await dbLookup({ userId: decoded.userId });
        if (!result) return next(new Error('User not found'));
        ({ name: userName, email: userEmail, workspaceIds } = result);
      }

      socket.user = { userId: decoded.userId.toString(), email: userEmail, name: userName, workspaceIds };
      next();
    } catch (error) {
      next(new Error(error.message || 'Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const { userId, name, email, workspaceIds } = socket.user;

    await presenceService.userConnected(socket.id, userId, { name, email }).catch(console.error);

    socket.join(`user:${userId}`);
    workspaceIds.forEach((wsId) => socket.join(`workspace:${wsId}`));

    offlineQueueService.deliver(socket, userId);

    socket.emit('connected', { userId, workspaces: workspaceIds, timestamp: new Date().toISOString() });

    workspaceIds.forEach((wsId) => {
      socket.to(`workspace:${wsId}`).emit('presence:online', {
        userId, name, timestamp: new Date().toISOString(),
      });
    });

    // Query room events
    socket.on('join:query', (queryId) => {
      const room = `query:${queryId}`;
      socket.join(room);
      presenceService.trackRoom(socket.id, room);
    });
    socket.on('leave:query', (queryId) => {
      const room = `query:${queryId}`;
      socket.leave(room);
      presenceService.untrackRoom(socket.id, room);
    });

    // Workspace room events
    socket.on('join:workspace', async (workspaceId) => {
      socket.join(`workspace:${workspaceId}`);
      socket.user.workspaceIds.push(workspaceId);
    });

    // Presence events
    socket.on('presence:join-workspace', async (workspaceId) => {
      try {
        const members = await presenceService.joinPresenceWorkspace(userId, workspaceId, { name, email });
        io.to(`workspace:${workspaceId}`).emit('presence:joined-workspace', {
          userId, name, status: 'online', timestamp: new Date().toISOString(),
        });
        socket.emit('presence:update', { workspaceId, onlineCount: members.length, users: members });
      } catch (err) {
        console.error('[createSocketServer] presence:join-workspace error:', err.message);
        socket.emit('presence:update', { workspaceId, onlineCount: 0, users: [] });
      }
    });

    socket.on('presence:leave-workspace', async (workspaceId) => {
      await presenceService.leavePresenceWorkspace(userId, workspaceId).catch(console.error);
      io.to(`workspace:${workspaceId}`).emit('presence:left-workspace', {
        userId, name, timestamp: new Date().toISOString(),
      });
    });

    socket.on('presence:status', async (status) => {
      if (!VALID_STATUSES.includes(status)) return;
      const workspaces = await presenceService.updateStatus(userId, status).catch(() => new Set());
      for (const wsId of workspaces) {
        io.to(`workspace:${wsId}`).emit('presence:status-changed', {
          userId, newStatus: status, timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on('presence:typing-start', async ({ workspaceId, conversationId }) => {
      await presenceService.setTyping(userId, workspaceId, conversationId, name).catch(console.error);
      io.to(`workspace:${workspaceId}`).emit('presence:typing-start', {
        userId, name, conversationId, timestamp: new Date().toISOString(),
      });
    });

    socket.on('presence:typing-stop', async ({ workspaceId, conversationId }) => {
      await presenceService.clearTyping(userId, workspaceId, conversationId).catch(console.error);
      io.to(`workspace:${workspaceId}`).emit('presence:typing-stop', {
        userId, name, conversationId, timestamp: new Date().toISOString(),
      });
    });

    socket.on('presence:get', async (workspaceId) => {
      try {
        const members = await presenceService.getWorkspacePresence(workspaceId);
        socket.emit('presence:update', { workspaceId, onlineCount: members.length, users: members });
      } catch {
        socket.emit('presence:update', { workspaceId, onlineCount: 0, users: [] });
      }
    });

    // Analytics (no-ops in microservice mode)
    socket.on('analytics:subscribe', () => {});
    socket.on('analytics:unsubscribe', () => {});
    socket.on('analytics:get', () => {
      socket.emit('analytics:metrics-update', {
        queries: null, health: null, timestamp: new Date().toISOString(),
        _note: 'analytics not supported in realtime-service mode',
      });
    });

    socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));

    socket.on('disconnect', async (reason) => {
      const result = await presenceService.userDisconnected(socket.id, userId, { name }).catch(() => ({
        isLastConnection: false, presenceWorkspaces: new Set(),
      }));

      if (result.isLastConnection) {
        for (const wsId of result.presenceWorkspaces) {
          io.to(`workspace:${wsId}`).emit('presence:left-workspace', {
            userId, name, timestamp: new Date().toISOString(),
          });
        }
        workspaceIds.forEach((wsId) => {
          io.to(`workspace:${wsId}`).emit('presence:offline', {
            userId, name, timestamp: new Date().toISOString(),
          });
        });
      }
    });
  });

  return io;
}
