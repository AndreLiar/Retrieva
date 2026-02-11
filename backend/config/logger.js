import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || 'info';
const logsDir = path.join(__dirname, '..', 'logs');

// Build transport targets
const targets = [];

// Console transport
if (!isProduction) {
  targets.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
    level: logLevel,
  });
} else {
  targets.push({
    target: 'pino/file',
    options: { destination: 1 }, // stdout
    level: logLevel,
  });
}

// File transports with rotation (skip in Docker — log rotation handled by Docker json-file driver)
if (!process.env.DOCKER_ENV) {
  targets.push(
    {
      target: 'pino-roll',
      options: {
        file: path.join(logsDir, 'combined'),
        size: '5m',
        limit: { count: 5 },
      },
      level: 'info',
    },
    {
      target: 'pino-roll',
      options: {
        file: path.join(logsDir, 'error'),
        size: '5m',
        limit: { count: 5 },
      },
      level: 'error',
    }
  );
}

// Create Pino logger with ECS-compatible base fields
// Note: When using transports, we can't use ecsFormat() directly due to Pino limitations
// Instead, we add ECS-compatible fields manually
const pinoLogger = pino({
  level: logLevel,
  base: {
    'service.name': 'rag-backend',
    'ecs.version': '8.11.0',
  },
  timestamp: () => `,"@timestamp":"${new Date().toISOString()}"`,
  messageKey: 'message',
  transport: { targets },
});

// Winston-compatible wrapper (handles argument order difference)
const logger = createCompatLogger(pinoLogger);

function createCompatLogger(pinoInstance) {
  const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  const compat = {};

  levels.forEach((level) => {
    compat[level] = (msgOrObj, metaOrMsg) => {
      if (typeof msgOrObj === 'string' && metaOrMsg === undefined) {
        pinoInstance[level](msgOrObj);
      } else if (typeof msgOrObj === 'string' && typeof metaOrMsg === 'object') {
        pinoInstance[level](metaOrMsg, msgOrObj); // Swap for Pino style
      } else if (typeof msgOrObj === 'object') {
        pinoInstance[level](msgOrObj, metaOrMsg || '');
      } else {
        pinoInstance[level](msgOrObj);
      }
    };
  });

  compat.child = (bindings) => createCompatLogger(pinoInstance.child(bindings));
  compat._pino = pinoInstance; // Access raw Pino if needed

  return compat;
}

export default logger;
