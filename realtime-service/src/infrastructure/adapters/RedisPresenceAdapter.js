import { IPresenceStore } from '../../domain/ports/IPresenceStore.js';
import { PRESENCE_TTL_SECONDS, TYPING_TTL_SECONDS } from '../../domain/UserStatus.js';

export class RedisPresenceAdapter extends IPresenceStore {
  #redis;

  constructor(redisClient) {
    super();
    this.#redis = redisClient;
  }

  async setUserPresence(userId, data) {
    const key = `presence:user:${userId}`;
    // Convert all values to strings for HSET
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    );
    await this.#redis.hset(key, stringData);
    await this.#redis.expire(key, PRESENCE_TTL_SECONDS);
  }

  async deleteUserPresence(userId) {
    await this.#redis.del(`presence:user:${userId}`);
  }

  async addWorkspaceMember(workspaceId, userId, data) {
    const key = `presence:workspace:${workspaceId}:members`;
    await this.#redis.hset(key, userId, JSON.stringify(data));
    await this.#redis.expire(key, PRESENCE_TTL_SECONDS);
  }

  async removeWorkspaceMember(workspaceId, userId) {
    const key = `presence:workspace:${workspaceId}:members`;
    await this.#redis.hdel(key, userId);
    const size = await this.#redis.hlen(key);
    if (size === 0) await this.#redis.del(key);
  }

  async setTypingUser(workspaceId, conversationId, userId, data) {
    const key = `presence:typing:${workspaceId}:${conversationId}`;
    await this.#redis.hset(key, userId, JSON.stringify(data));
    await this.#redis.expire(key, TYPING_TTL_SECONDS);
  }

  async clearTypingUser(workspaceId, conversationId, userId) {
    await this.#redis.hdel(`presence:typing:${workspaceId}:${conversationId}`, userId);
  }

  async getWorkspaceMembers(workspaceId) {
    const raw = await this.#redis.hgetall(`presence:workspace:${workspaceId}:members`) || {};
    return Object.values(raw).map((v) => JSON.parse(v));
  }
}
