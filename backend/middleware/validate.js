import { ZodError } from 'zod';
import logger from '../config/logger.js';
import { sendError } from '../utils/core/responseFormatter.js';

/**
 * Validation middleware factory
 * Creates middleware that validates request data against Zod schemas
 *
 * @param {Object} schema - Zod schema to validate against
 * @param {string} source - Where to get data from ('body', 'query', 'params')
 * @returns {Function} Express middleware
 */
export const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      const dataToValidate = req[source];

      // Validate and parse data - this validates the input
      const validatedData = await schema.parseAsync(dataToValidate);

      // Store validated data for access
      req.validatedData = req.validatedData || {};
      req.validatedData[source] = validatedData;

      // For body, we can replace it directly
      if (source === 'body') {
        req.body = validatedData;
      }
      // For query/params in Express 5, the objects may be read-only
      // Just validate and pass through - controllers use raw req.query

      // Add validated flag for tracking
      req.validated = true;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors for user-friendly response
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Validation failed', {
          source,
          errors,
          path: req.path,
        });

        return sendError(res, 400, 'Validation failed', { errors });
      }

      // Unexpected error
      logger.error('Validation middleware error', {
        error: error.message,
        stack: error.stack,
      });

      return sendError(res, 500, 'Internal validation error');
    }
  };
};

/**
 * Validate request body
 */
export const validateBody = (schema) => validate(schema, 'body');

/**
 * Validate query parameters
 */
export const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate URL parameters
 */
export const validateParams = (schema) => validate(schema, 'params');
