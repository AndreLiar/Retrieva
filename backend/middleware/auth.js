/**
 * Authentication Middleware
 * Handles JWT authentication and role-based authorization
 *
 * Supports two authentication methods:
 * 1. HTTP-only cookies (primary, more secure for browsers)
 * 2. Authorization header (fallback for API clients, mobile apps)
 *
 * @module middleware/auth
 */

import { verifyAccessToken } from '../utils/security/jwt.js';
import { User } from '../models/User.js';
import { sendError } from '../utils/core/responseFormatter.js';
import { getAccessToken } from '../utils/security/cookieConfig.js';
import logger from '../config/logger.js';

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

/**
 * @typedef {Object} AuthenticatedUser
 * @property {import('mongoose').Types.ObjectId} userId - User's MongoDB ID
 * @property {string} email - User's email address
 * @property {'user'|'admin'} role - User's role
 * @property {string} name - User's display name
 */

/**
 * @typedef {Request & { user?: AuthenticatedUser }} AuthenticatedRequest
 */

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 *
 * Token sources (checked in order):
 * 1. HTTP-only cookie 'accessToken' (primary, secure)
 * 2. Authorization header 'Bearer <token>' (fallback for API clients)
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Next middleware function
 * @returns {Promise<void>}
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    const token = getAccessToken(req);

    if (!token) {
      logger.warn('No token provided', { path: req.path, ip: req.ip });
      return sendError(res, 401, 'Authentication required');
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      logger.warn('Invalid token', {
        error: error.message,
        path: req.path,
        ip: req.ip,
      });
      return sendError(res, 401, error.message || 'Invalid token');
    }

    // Get user from database
    const user = await User.findById(decoded.userId);

    if (!user) {
      logger.warn('User not found for token', { userId: decoded.userId });
      return sendError(res, 401, 'User not found');
    }

    if (!user.isActive) {
      logger.warn('Inactive user attempted access', { userId: user._id });
      return sendError(res, 401, 'Account is inactive');
    }

    // Attach user to request
    req.user = {
      userId: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    logger.debug('User authenticated', {
      userId: user._id,
      email: user.email,
      path: req.path,
    });

    next();
  } catch (error) {
    logger.error('Authentication middleware error', {
      error: error.message,
      stack: error.stack,
    });
    return sendError(res, 500, 'Authentication failed');
  }
};

/**
 * Authorization middleware factory - checks if user has required role
 * Must be used after authenticate middleware
 *
 * @param {...('user'|'admin')} roles - Allowed roles for this route
 * @returns {function(Request, Response, NextFunction): void} Express middleware
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.error('Authorization called without authentication');
      return sendError(res, 401, 'Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt', {
        userId: req.user.userId,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      return sendError(res, 403, `Forbidden. Required role: ${roles.join(' or ')}`);
    }

    logger.debug('User authorized', {
      userId: req.user.userId,
      role: req.user.role,
      path: req.path,
    });

    next();
  };
};

/**
 * Optional authentication middleware
 * Attaches user to request if valid token present, but doesn't require it
 * Useful for endpoints that behave differently for authenticated vs anonymous users
 *
 * Token sources (checked in order):
 * 1. HTTP-only cookie 'accessToken'
 * 2. Authorization header 'Bearer <token>'
 *
 * SECURITY FIX: Now logs failed token attempts for monitoring
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Next middleware function
 * @returns {Promise<void>}
 */
export const optionalAuth = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    const token = getAccessToken(req);

    if (!token) {
      // No token provided, continue without user
      return next();
    }

    try {
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.userId);

      if (user && user.isActive) {
        req.user = {
          userId: user._id,
          email: user.email,
          role: user.role,
          name: user.name,
        };
      } else if (user && !user.isActive) {
        // SECURITY FIX: Log inactive user token usage
        logger.warn('Optional auth - inactive user token detected', {
          userId: decoded.userId,
          path: req.path,
          ip: req.ip,
        });
      }
    } catch (error) {
      // SECURITY FIX: Log failed token attempts for security monitoring
      // This helps detect token theft/replay attempts
      logger.warn('Optional auth - invalid token detected', {
        error: error.message,
        errorType: error.name,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent']?.substring(0, 100),
      });

      // Log security event for potential token attacks
      try {
        const { logSecurityEvent } = await import('../services/securityLogger.js');
        logSecurityEvent(
          'invalid_token_optional_auth',
          {
            error: error.message,
            path: req.path,
          },
          {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          }
        );
      } catch {
        // Don't fail if security logging fails
      }
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error', { error: error.message });
    next(); // Continue even if error
  }
};
