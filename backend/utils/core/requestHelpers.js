/**
 * Request Helpers
 *
 * Centralized utilities for common request handling patterns:
 * - User ID extraction
 * - Pagination parsing
 * - Query parameter validation
 *
 * @module utils/core/requestHelpers
 */

/**
 * Extract user ID from request
 * @param {Object} req - Express request object
 * @param {string} fallback - Fallback value if no user (default 'anonymous')
 * @returns {string} User ID or fallback
 */
export const getUserId = (req, fallback = 'anonymous') => {
  return req.user?.userId || fallback;
};

/**
 * Check if user is authenticated
 * @param {Object} req - Express request object
 * @returns {boolean} Whether user is authenticated
 */
export const isAuthenticated = (req) => {
  return !!(req.user?.userId);
};

/**
 * Safely parse integer with fallback
 * ISSUE #27 FIX: Robust integer parsing
 * @param {*} value - Value to parse
 * @param {number} fallback - Fallback if invalid
 * @returns {number} Parsed integer or fallback
 */
const safeParseInt = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || !Number.isFinite(parsed) ? fallback : parsed;
};

/**
 * Parse and validate pagination parameters
 * ISSUE #27 FIX: Robust handling of invalid/negative values
 * @param {Object} query - Request query object
 * @param {Object} options - Pagination options
 * @param {number} options.defaultLimit - Default limit (default 50)
 * @param {number} options.maxLimit - Maximum allowed limit (default 100)
 * @param {number} options.defaultSkip - Default skip (default 0)
 * @returns {{ limit: number, skip: number, page: number }}
 */
export const parsePagination = (query, options = {}) => {
  const { defaultLimit = 50, maxLimit = 100, defaultSkip = 0 } = options;

  // ISSUE #27 FIX: Use safe parsing and ensure positive values
  const rawLimit = safeParseInt(query?.limit, defaultLimit);
  const rawSkip = safeParseInt(query?.skip, defaultSkip);
  const rawPage = safeParseInt(query?.page, 1);

  // Clamp to valid ranges: limit [1, maxLimit], skip [0, Infinity], page [1, Infinity]
  const limit = Math.min(Math.max(rawLimit, 1), maxLimit);
  const skip = Math.max(rawSkip, 0);
  const page = Math.max(rawPage, 1);

  return { limit, skip, page };
};

/**
 * Parse pagination with page-based offset calculation
 * ISSUE #27 FIX: Use safe parsing
 * @param {Object} query - Request query object
 * @param {Object} options - Pagination options
 * @returns {{ limit: number, skip: number, page: number }}
 */
export const parsePagePagination = (query, options = {}) => {
  const { defaultLimit = 20, maxLimit = 50 } = options;

  const rawPage = safeParseInt(query?.page, 1);
  const rawLimit = safeParseInt(query?.limit, defaultLimit);

  const page = Math.max(rawPage, 1);
  const limit = Math.min(Math.max(rawLimit, 1), maxLimit);
  const skip = (page - 1) * limit;

  return { limit, skip, page };
};

/**
 * Build pagination response metadata
 * @param {number} total - Total number of items
 * @param {number} limit - Items per page
 * @param {number} skip - Items skipped
 * @returns {Object} Pagination metadata
 */
export const buildPaginationMeta = (total, limit, skip) => {
  const currentPage = Math.floor(skip / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return {
    total,
    limit,
    skip,
    page: currentPage,
    totalPages,
    hasMore: skip + limit < total,
    hasPrevious: skip > 0,
  };
};

/**
 * Parse and validate sort parameters
 * @param {string} sortQuery - Sort query string (e.g., '-createdAt' or 'name')
 * @param {string[]} allowedFields - Fields allowed for sorting
 * @param {string} defaultSort - Default sort field
 * @returns {Object} MongoDB sort object
 */
export const parseSort = (sortQuery, allowedFields = [], defaultSort = '-createdAt') => {
  const sort = sortQuery || defaultSort;
  const direction = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '');

  if (allowedFields.length > 0 && !allowedFields.includes(field)) {
    const defaultField = defaultSort.replace(/^-/, '');
    const defaultDirection = defaultSort.startsWith('-') ? -1 : 1;
    return { [defaultField]: defaultDirection };
  }

  return { [field]: direction };
};

/**
 * Verify resource ownership
 * Compares user ID with resource owner ID (handles ObjectId conversion)
 * @param {string|Object} ownerId - Resource owner ID (may be ObjectId)
 * @param {string} userId - Current user ID
 * @returns {boolean} Whether user owns the resource
 */
export const verifyOwnership = (ownerId, userId) => {
  const ownerStr = ownerId?.toString() || ownerId;
  const userStr = userId?.toString() || userId;
  return ownerStr === userStr;
};

export default {
  getUserId,
  isAuthenticated,
  parsePagination,
  parsePagePagination,
  buildPaginationMeta,
  parseSort,
  verifyOwnership,
};
