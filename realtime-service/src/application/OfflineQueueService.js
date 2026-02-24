const MAX_QUEUE_SIZE = 100;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const QUEUE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1h

export class OfflineQueueService {
  #queue = new Map(); // userId -> { messages: Array, createdAt: Date }
  #cleanupTimer = null;

  enqueue(userId, event, data) {
    if (!this.#queue.has(userId)) {
      this.#queue.set(userId, { messages: [], createdAt: new Date() });
    }
    const entry = this.#queue.get(userId);
    if (entry.messages.length >= MAX_QUEUE_SIZE) entry.messages.shift();
    entry.messages.push({ event, data: { ...data, queuedAt: new Date().toISOString() } });
  }

  // Returns messages array and clears queue atomically; null if empty
  take(userId) {
    const entry = this.#queue.get(userId);
    if (!entry || entry.messages.length === 0) return null;
    this.#queue.delete(userId);
    return entry.messages;
  }

  // Delivers queued messages to a socket and clears queue
  deliver(socket, userId) {
    const messages = this.take(userId);
    if (!messages) return;
    const deliveryId = `${userId}-${Date.now()}`;
    messages.forEach(({ event, data }, index) => {
      socket.emit(event, { ...data, wasQueued: true, deliveryId, messageIndex: index });
    });
  }

  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, entry] of this.#queue.entries()) {
      if (now - entry.createdAt.getTime() > MAX_QUEUE_AGE_MS) {
        this.#queue.delete(userId);
        cleaned++;
      }
    }
    return cleaned;
  }

  startCleanupInterval() {
    this.#cleanupTimer = setInterval(() => {
      const cleaned = this.cleanup();
      if (cleaned > 0) console.log(`[OfflineQueueService] Cleaned ${cleaned} stale queues`);
    }, QUEUE_CLEANUP_INTERVAL_MS);
    this.#cleanupTimer.unref?.(); // don't block process exit
    return this;
  }

  stopCleanupInterval() {
    if (this.#cleanupTimer) {
      clearInterval(this.#cleanupTimer);
      this.#cleanupTimer = null;
    }
  }

  size() {
    return this.#queue.size;
  }
}
