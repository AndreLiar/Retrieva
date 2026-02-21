/**
 * Notification Routes
 *
 * API routes for notification management:
 * - GET /notifications - List notifications
 * - GET /notifications/count - Get unread count
 * - POST /notifications/read - Mark as read (batch)
 * - PATCH /notifications/:id/read - Mark single as read
 * - DELETE /notifications/:id - Delete notification
 * - GET /notifications/preferences - Get preferences
 * - PUT /notifications/preferences - Update preferences
 * - GET /notifications/types - Get notification types
 *
 * @module routes/notificationRoutes
 */

import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markOneAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
  getNotificationTypes,
} from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';
import { notificationCountLimiter } from '../middleware/ragRateLimiter.js';

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/notifications
 * @desc    Get user's notifications (paginated)
 * @access  Private
 * @query   page, limit, type, unreadOnly
 */
router.get('/', getNotifications);

/**
 * @route   GET /api/v1/notifications/count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get('/count', notificationCountLimiter, getUnreadCount);

/**
 * @route   GET /api/v1/notifications/preferences
 * @desc    Get notification preferences
 * @access  Private
 */
router.get('/preferences', getPreferences);

/**
 * @route   PUT /api/v1/notifications/preferences
 * @desc    Update notification preferences
 * @access  Private
 * @body    { inApp: {...}, email: {...} }
 */
router.put('/preferences', updatePreferences);

/**
 * @route   GET /api/v1/notifications/types
 * @desc    Get available notification types
 * @access  Private
 */
router.get('/types', getNotificationTypes);

/**
 * @route   POST /api/v1/notifications/read
 * @desc    Mark notifications as read (batch)
 * @access  Private
 * @body    { notificationIds: [...] } or { all: true }
 */
router.post('/read', markAsRead);

/**
 * @route   PATCH /api/v1/notifications/:notificationId/read
 * @desc    Mark single notification as read
 * @access  Private
 */
router.patch('/:notificationId/read', markOneAsRead);

/**
 * @route   DELETE /api/v1/notifications/:notificationId
 * @desc    Delete a notification
 * @access  Private
 */
router.delete('/:notificationId', deleteNotification);

export { router as notificationRoutes };
