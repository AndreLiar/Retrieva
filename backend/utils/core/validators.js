/**
 * Validation utilities for request data
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate if string is not empty
 * @param {string} str - String to validate
 * @returns {boolean}
 */
export const isNotEmpty = (str) => {
  return typeof str === 'string' && str.trim().length > 0;
};

/**
 * Validate question for RAG system
 * @param {string} question - Question to validate
 * @returns {{valid: boolean, error?: string}}
 */
export const validateQuestion = (question) => {
  if (!question) {
    return { valid: false, error: 'Question is required' };
  }

  if (typeof question !== 'string') {
    return { valid: false, error: 'Question must be a string' };
  }

  if (question.trim().length === 0) {
    return { valid: false, error: 'Question cannot be empty' };
  }

  if (question.length > 5000) {
    return { valid: false, error: 'Question is too long (max 5000 characters)' };
  }

  return { valid: true };
};

/**
 * Validate chat history array
 * @param {Array} chatHistory - Chat history to validate
 * @returns {{valid: boolean, error?: string}}
 */
export const validateChatHistory = (chatHistory) => {
  if (!chatHistory) {
    return { valid: true }; // Optional field
  }

  if (!Array.isArray(chatHistory)) {
    return { valid: false, error: 'Chat history must be an array' };
  }

  if (chatHistory.length > 50) {
    return { valid: false, error: 'Chat history too long (max 50 messages)' };
  }

  for (const msg of chatHistory) {
    if (!msg.role || !msg.content) {
      return { valid: false, error: 'Each message must have role and content' };
    }
    if (!['user', 'assistant'].includes(msg.role)) {
      return { valid: false, error: 'Message role must be "user" or "assistant"' };
    }
  }

  return { valid: true };
};

/**
 * Sanitize string input to prevent injection attacks
 * @param {string} input - Input to sanitize
 * @returns {string}
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;

  // Remove potential NoSQL injection patterns
  return input
    .replace(/[{}$]/g, '') // Remove MongoDB operators
    .trim();
};
