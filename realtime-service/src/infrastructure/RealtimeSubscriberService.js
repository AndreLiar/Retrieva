export class RealtimeSubscriberService {
  #redisSub;
  #io;
  #presenceService;
  #offlineQueueService;

  constructor({ redisSub, io, presenceService, offlineQueueService }) {
    this.#redisSub = redisSub;
    this.#io = io;
    this.#presenceService = presenceService;
    this.#offlineQueueService = offlineQueueService;
  }

  init() {
    this.#redisSub.psubscribe('realtime:*', (err) => {
      if (err) console.error('[RealtimeSubscriberService] psubscribe error:', err.message);
      else console.log('[RealtimeSubscriberService] Subscribed to realtime:*');
    });

    this.#redisSub.on('pmessage', (_pattern, channel, rawMessage) => {
      let parsed;
      try { parsed = JSON.parse(rawMessage); } catch {
        console.error('[RealtimeSubscriberService] Invalid JSON on channel:', channel);
        return;
      }

      const { event, data } = parsed;
      const parts = channel.split(':');
      const type = parts[1];
      const id = parts.slice(2).join(':');

      switch (type) {
        case 'user':
          if (this.#presenceService.isUserOnline(id)) {
            this.#io.to(`user:${id}`).emit(event, data);
          } else {
            this.#offlineQueueService.enqueue(id, event, data);
          }
          break;
        case 'workspace':
          this.#io.to(`workspace:${id}`).emit(event, data);
          break;
        case 'query':
          this.#io.to(`query:${id}`).emit(event, data);
          break;
        case 'broadcast':
          this.#io.emit(event, data);
          break;
        default:
          console.warn('[RealtimeSubscriberService] Unknown channel type:', channel);
      }
    });
  }
}
