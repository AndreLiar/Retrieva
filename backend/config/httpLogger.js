import pinoHttp from 'pino-http';
import logger from './logger.js';

export const httpLogger = pinoHttp({
  logger: logger._pino, // Use raw Pino instance

  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,

  autoLogging: {
    ignore: (req) =>
      req.url.includes('/health') ||
      req.url.includes('/favicon') ||
      req.url.includes('/api-docs'),
  },

  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
