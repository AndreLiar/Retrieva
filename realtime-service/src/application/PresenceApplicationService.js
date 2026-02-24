export class PresenceApplicationService {
  #presenceStore;
  #connectedUsers = new Map();      // userId -> Set<socketId>
  #socketRooms = new Map();         // socketId -> Set<roomName>
  #userPresenceWorkspaces = new Map(); // userId -> Set<workspaceId>

  constructor({ presenceStore }) {
    this.#presenceStore = presenceStore;
  }

  // Called when a socket connects
  async userConnected(socketId, userId, userInfo) {
    if (!this.#connectedUsers.has(userId)) {
      this.#connectedUsers.set(userId, new Set());
    }
    this.#connectedUsers.get(userId).add(socketId);
    this.#socketRooms.set(socketId, new Set());

    await this.#presenceStore.setUserPresence(userId, {
      status: 'online',
      lastSeen: new Date().toISOString(),
      name: userInfo.name,
      email: userInfo.email,
      connections: this.#connectedUsers.get(userId).size,
    });
  }

  // Called when a socket disconnects
  // Returns { isLastConnection: boolean, presenceWorkspaces: Set<workspaceId> }
  async userDisconnected(socketId, userId, userInfo) {
    // Clean up tracked rooms for this socket
    this.#socketRooms.delete(socketId);

    const userSockets = this.#connectedUsers.get(userId);
    if (!userSockets) {
      return { isLastConnection: true, presenceWorkspaces: new Set() };
    }

    userSockets.delete(socketId);

    if (userSockets.size === 0) {
      this.#connectedUsers.delete(userId);

      const presenceWorkspaces = this.#userPresenceWorkspaces.get(userId) || new Set();

      // Remove from all presence workspaces
      for (const wsId of presenceWorkspaces) {
        await this.#presenceStore.removeWorkspaceMember(wsId, userId);
      }

      // Delete user presence from store
      await this.#presenceStore.deleteUserPresence(userId);

      // Clean up presence workspace tracking
      this.#userPresenceWorkspaces.delete(userId);

      return { isLastConnection: true, presenceWorkspaces };
    } else {
      // Still has other connections — update connection count
      await this.#presenceStore.setUserPresence(userId, {
        connections: userSockets.size,
      });
      return { isLastConnection: false, presenceWorkspaces: new Set() };
    }
  }

  // Returns true if user has at least one connected socket
  isUserOnline(userId) {
    const sockets = this.#connectedUsers.get(userId);
    return !!(sockets && sockets.size > 0);
  }

  // Track a dynamic room for a socket (e.g., query:xxx)
  trackRoom(socketId, roomName) {
    this.#socketRooms.get(socketId)?.add(roomName);
  }

  untrackRoom(socketId, roomName) {
    this.#socketRooms.get(socketId)?.delete(roomName);
  }

  getTrackedRooms(socketId) {
    return this.#socketRooms.get(socketId) || new Set();
  }

  // Presence workspace tracking
  async joinPresenceWorkspace(userId, workspaceId, userInfo) {
    if (!this.#userPresenceWorkspaces.has(userId)) {
      this.#userPresenceWorkspaces.set(userId, new Set());
    }
    this.#userPresenceWorkspaces.get(userId).add(workspaceId);
    await this.#presenceStore.addWorkspaceMember(workspaceId, userId, {
      userId, name: userInfo.name, email: userInfo.email,
      status: 'online', joinedAt: new Date().toISOString(),
    });
    return await this.#presenceStore.getWorkspaceMembers(workspaceId);
  }

  async leavePresenceWorkspace(userId, workspaceId) {
    this.#userPresenceWorkspaces.get(userId)?.delete(workspaceId);
    await this.#presenceStore.removeWorkspaceMember(workspaceId, userId);
  }

  async updateStatus(userId, status) {
    await this.#presenceStore.setUserPresence(userId, {
      status, lastSeen: new Date().toISOString(),
    });
    return this.#userPresenceWorkspaces.get(userId) || new Set();
  }

  async setTyping(userId, workspaceId, conversationId, name) {
    await this.#presenceStore.setTypingUser(workspaceId, conversationId, userId, {
      userId, name, startedAt: new Date().toISOString(),
    });
  }

  async clearTyping(userId, workspaceId, conversationId) {
    await this.#presenceStore.clearTypingUser(workspaceId, conversationId, userId);
  }

  async getWorkspacePresence(workspaceId) {
    return this.#presenceStore.getWorkspaceMembers(workspaceId);
  }

  getUserPresenceWorkspaces(userId) {
    return this.#userPresenceWorkspaces.get(userId) || new Set();
  }

  getConnectionCount() {
    return this.#connectedUsers.size;
  }
}
