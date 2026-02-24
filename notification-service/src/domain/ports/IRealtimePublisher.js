export class IRealtimePublisher {
  /** Publish event to a specific user's channel */
  async publishToUser(userId, event, data) { throw new Error('Not implemented'); }
  /** Check if user is currently online */
  async isUserOnline(userId) { throw new Error('Not implemented'); }
}
