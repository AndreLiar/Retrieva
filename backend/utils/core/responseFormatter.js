/**
 * Response formatter utilities
 */

/**
 * Format success response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Success message
 * @param {Object} data - Response data
 */
export const sendSuccess = (res, statusCode, message, data = null) => {
  const response = {
    status: 'success',
    message,
  };

  if (data) {
    response.data = data;
  }

  res.status(statusCode).json(response);
};

/**
 * Format error response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Object} errors - Additional error details
 */
export const sendError = (res, statusCode, message, errors = null) => {
  const response = {
    status: 'error',
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  res.status(statusCode).json(response);
};

/**
 * Format paginated response
 * @param {Object} res - Express response object
 * @param {Array} data - Data array
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 */
export const sendPaginatedResponse = (res, data, page, limit, total) => {
  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    status: 'success',
    data,
    pagination: {
      currentPage: page,
      totalPages,
      itemsPerPage: limit,
      totalItems: total,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  });
};
