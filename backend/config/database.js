import mongoose from 'mongoose';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

// D5: query hardening. `strictQuery` drops filter conditions on paths not in
// the schema (defense-in-depth against unexpected/injected filter keys).
//
// NOTE: we intentionally do NOT enable global `sanitizeFilter` — it wraps any
// filter *value* that is an operator object in `$eq`, which would break the
// many legitimate code-written operator queries here ({ workspaceId: { $in } },
// date { $gte/$lte }, etc.). User-input injection is already neutralized at the
// request boundary by middleware/securitySanitizer.js.
mongoose.set('strictQuery', true);

// FIX 2: MongoDB Connection Resilience
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 5000; // 5 seconds

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Connection pool settings for better stability
      maxPoolSize: 50, // Maximum connections in pool
      minPoolSize: 10, // Minimum connections in pool
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      serverSelectionTimeoutMS: 10000, // Timeout after 10s instead of 30s
      heartbeatFrequencyMS: 2000, // Check server health every 2s

      // Auto-reconnect settings
      retryWrites: true,
      retryReads: true,

      // D3: don't auto-build indexes on every boot in production (blocking on
      // large collections); we sync them explicitly below instead.
      autoIndex: process.env.NODE_ENV !== 'production',
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`, {
      service: 'database',
      database: conn.connection.name,
    });

    // D3: with autoIndex off in production, sync declared indexes once on
    // startup. Models are already registered (app.js is imported before this
    // runs). Best-effort per model so one failure can't block boot.
    if (process.env.NODE_ENV === 'production') {
      await Promise.all(
        mongoose.connection.modelNames().map((name) =>
          mongoose
            .model(name)
            .syncIndexes()
            .catch((err) =>
              logger.warn('Index sync failed', {
                service: 'database',
                model: name,
                error: err.message,
              })
            )
        )
      );
      logger.info('Indexes synced', { service: 'database' });
    }

    // Reset reconnect attempts on successful connection
    reconnectAttempts = 0;

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', {
        service: 'database',
        error: err.message,
      });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected - attempting to reconnect...', {
        service: 'database',
        reconnectAttempts,
      });

      // Auto-reconnect on disconnect
      handleReconnect();
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected successfully', { service: 'database' });
      reconnectAttempts = 0;
    });

    mongoose.connection.on('reconnectFailed', () => {
      logger.error('MongoDB reconnect failed after max attempts', { service: 'database' });
    });

    return conn;
  } catch (error) {
    logger.error('Error connecting to MongoDB:', {
      service: 'database',
      error: error.message,
    });

    // Retry connection instead of exiting immediately
    handleReconnect();
  }
};

/**
 * Handle MongoDB reconnection with exponential backoff
 */
async function handleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error('Max reconnection attempts reached. Exiting...', { service: 'database' });
    process.exit(1);
  }

  reconnectAttempts++;
  const delay = RECONNECT_INTERVAL * Math.min(reconnectAttempts, 5); // Max 25s delay

  logger.info(
    `Reconnecting to MongoDB in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
    {
      service: 'database',
    }
  );

  setTimeout(async () => {
    try {
      await connectDB();
    } catch (err) {
      logger.error('Reconnection attempt failed:', {
        service: 'database',
        error: err.message,
      });
    }
  }, delay);
}

export const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed', { service: 'database' });
  } catch (error) {
    logger.error('Error closing MongoDB connection:', {
      service: 'database',
      error: error.message,
    });
  }
};
