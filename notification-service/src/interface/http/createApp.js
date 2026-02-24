import express from 'express';
import { createNotificationsRouter } from './createNotificationsRouter.js';
import { createNotifyRouter } from './createNotifyRouter.js';

export function createApp({ notificationService, internalApiKey }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.use('/internal', (req, res, next) => {
    if (internalApiKey && req.headers['x-internal-api-key'] !== internalApiKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  app.get('/health', (_req, res) =>
    res.json({ status: 'ok', service: 'notification-service', ts: new Date().toISOString() })
  );

  app.use('/internal/notifications', createNotificationsRouter(notificationService));
  app.use('/internal/notify', createNotifyRouter(notificationService));

  return app;
}
