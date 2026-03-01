/**
 * Environment Variable Validator
 *
 * Validates required environment variables at startup.
 * Fails fast if critical configuration is missing.
 *
 * @module config/envValidator
 */

import logger from './logger.js';

/**
 * Required environment variables by category
 * ISSUE #21 FIX: Infrastructure services required in production
 */
const REQUIRED_ENV_VARS = {
  // Critical - Server won't function without these
  critical: [
    { name: 'JWT_ACCESS_SECRET', minLength: 32, description: 'JWT access token secret' },
    { name: 'JWT_REFRESH_SECRET', minLength: 32, description: 'JWT refresh token secret' },
  ],

  // Database - Required for data persistence
  database: [{ name: 'MONGODB_URI', description: 'MongoDB connection string' }],

  // Infrastructure - Required in production for core functionality
  infrastructure: [
    { name: 'REDIS_URL', description: 'Redis connection URL (caching, queues)' },
    { name: 'QDRANT_URL', description: 'Qdrant vector database URL' },
  ],

  // LLM - Required in production but provider-dependent
  llm: [{ name: 'LLM_PROVIDER', description: 'LLM provider (azure_openai, ollama)' }],

  // Optional but recommended for full functionality
  recommended: [
    { name: 'FRONTEND_URL', description: 'Frontend URL for OAuth redirects' },
    { name: 'ALLOWED_ORIGINS', description: 'CORS allowed origins' },
  ],
};

/**
 * Validate a single environment variable
 *
 * @param {Object} config - Variable configuration
 * @param {string} config.name - Environment variable name
 * @param {number} config.minLength - Minimum required length
 * @param {string} config.description - Human-readable description
 * @returns {{ valid: boolean, error?: string }}
 */
function validateVar({ name, minLength, description }) {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    return { valid: false, error: `Missing required: ${name} (${description})` };
  }

  if (minLength && value.length < minLength) {
    return {
      valid: false,
      error: `${name} must be at least ${minLength} characters (current: ${value.length})`,
    };
  }

  return { valid: true };
}

/**
 * Validate all required environment variables
 * ISSUE #21 FIX: Infrastructure vars required in production
 *
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - If true, also require recommended vars
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateEnv(options = {}) {
  const { strict = false } = options;
  const isProduction = process.env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  // Validate critical variables (always required)
  for (const varConfig of REQUIRED_ENV_VARS.critical) {
    const result = validateVar(varConfig);
    if (!result.valid) {
      errors.push(result.error);
    }
  }

  // Validate database variables (always required)
  for (const varConfig of REQUIRED_ENV_VARS.database) {
    const result = validateVar(varConfig);
    if (!result.valid) {
      errors.push(result.error);
    }
  }

  // ISSUE #21 FIX: Validate infrastructure variables (required in production, warned in dev)
  for (const varConfig of REQUIRED_ENV_VARS.infrastructure) {
    const result = validateVar(varConfig);
    if (!result.valid) {
      if (isProduction || strict) {
        errors.push(result.error);
      } else {
        warnings.push(
          `${varConfig.name} not configured - ${varConfig.description} (required in production)`
        );
      }
    }
  }

  // Validate LLM variables (required in production)
  for (const varConfig of REQUIRED_ENV_VARS.llm) {
    const result = validateVar(varConfig);
    if (!result.valid) {
      if (isProduction || strict) {
        errors.push(result.error);
      } else {
        warnings.push(
          `${varConfig.name} not configured - ${varConfig.description} (required in production)`
        );
      }
    }
  }

  // Validate recommended variables (warn if missing, error in strict mode)
  for (const varConfig of REQUIRED_ENV_VARS.recommended) {
    const result = validateVar(varConfig);
    if (!result.valid) {
      if (strict) {
        errors.push(result.error);
      } else {
        warnings.push(`${varConfig.name} not configured - ${varConfig.description}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate environment and exit if invalid
 * Call this at the very start of the application
 *
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - If true, also require recommended vars
 */
export function validateEnvOrExit(options = {}) {
  const result = validateEnv(options);

  // Log warnings
  for (const warning of result.warnings) {
    logger.warn(`ENV WARNING: ${warning}`, { service: 'env-validator' });
  }

  // If invalid, log errors and exit
  if (!result.valid) {
    logger.error('Environment validation failed', { service: 'env-validator' });
    for (const error of result.errors) {
      logger.error(`  - ${error}`, { service: 'env-validator' });
    }
    logger.error('Please check your .env file and ensure all required variables are set.', {
      service: 'env-validator',
    });
    process.exit(1);
  }

  logger.info('Environment validation passed', { service: 'env-validator' });
}

/**
 * Get current environment info for debugging
 *
 * @returns {Object} Environment information (sanitized)
 */
export function getEnvInfo() {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    mongoConfigured: !!process.env.MONGODB_URI,
    redisConfigured: !!process.env.REDIS_URL,
    qdrantConfigured: !!process.env.QDRANT_URL,
    llmProvider: process.env.LLM_PROVIDER || 'not configured',
    emailConfigured: !!process.env.RESEND_API_KEY,
    frontendUrl: process.env.FRONTEND_URL || 'not configured',
  };
}

export default {
  validateEnv,
  validateEnvOrExit,
  getEnvInfo,
};
