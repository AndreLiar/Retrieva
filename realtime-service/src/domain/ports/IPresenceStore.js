export class IPresenceStore {
  async setUserPresence(userId, data) { throw new Error('not implemented'); }
  async deleteUserPresence(userId) { throw new Error('not implemented'); }
  async addWorkspaceMember(workspaceId, userId, data) { throw new Error('not implemented'); }
  async removeWorkspaceMember(workspaceId, userId) { throw new Error('not implemented'); }
  async setTypingUser(workspaceId, conversationId, userId, data) { throw new Error('not implemented'); }
  async clearTypingUser(workspaceId, conversationId, userId) { throw new Error('not implemented'); }
  async getWorkspaceMembers(workspaceId) { throw new Error('not implemented'); }
}
