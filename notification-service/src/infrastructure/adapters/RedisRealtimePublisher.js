import IORedis from 'ioredis';

export class RedisRealtimePublisher {
  constructor(redisUrl) {
    this._redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    this._redis.on('error', (err) => {
      console.error('[RedisRealtimePublisher] Redis error:', err.message);
    });
  }

  async connect() {
    return this._redis.connect().catch((err) => {
      console.warn('[RedisRealtimePublisher] Connect failed:', err.message);
    });
  }

  async publishToUser(userId, event, data) {
    try {
      await this._redis.publish(`realtime:user:${userId}`, JSON.stringify({ event, data }));
    } catch (err) {
      console.error('[RedisRealtimePublisher] Failed to publish:', err.message);
    }
  }

  async isUserOnline(userId) {
    try {
      const status = await this._redis.hget(`presence:user:${userId}`, 'status');
      return status === 'online' || status === 'away';
    } catch {
      return false;
    }
  }
}
