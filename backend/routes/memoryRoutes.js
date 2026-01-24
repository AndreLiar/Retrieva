/**
 * Memory System Routes
 *
 * API endpoints for memory monitoring, metrics, and administration
 *
 * @module routes/memoryRoutes
 */

import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getDashboard,
  getCacheStats,
  getMemoryBuildStats,
  getDecayStats,
  triggerDecay,
  getDecayJobs,
  getEntityMemoryStats,
  getDatabaseStats,
  getHourlyMetrics,
  getRedisStats,
  clearConversationMemory,
  clearAllCaches,
  resetMetrics,
  updateDecayConfig,
} from '../controllers/memoryController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================================================
// Dashboard & Overview
// ============================================================================

/**
 * @route GET /api/v1/memory/dashboard
 * @desc Get comprehensive memory system dashboard
 * @access Private
 */
router.get('/dashboard', getDashboard);

// ============================================================================
// Cache Metrics
// ============================================================================

/**
 * @route GET /api/v1/memory/cache
 * @desc Get cache hit/miss statistics
 * @access Private
 * @query {string} type - Cache type (default: 'total')
 */
router.get('/cache', getCacheStats);

// ============================================================================
// Memory Build Metrics
// ============================================================================

/**
 * @route GET /api/v1/memory/builds
 * @desc Get memory context build statistics
 * @access Private
 */
router.get('/builds', getMemoryBuildStats);

// ============================================================================
// Entity Memory
// ============================================================================

/**
 * @route GET /api/v1/memory/entities
 * @desc Get entity memory statistics
 * @access Private
 */
router.get('/entities', getEntityMemoryStats);

// ============================================================================
// Decay Process
// ============================================================================

/**
 * @route GET /api/v1/memory/decay/stats
 * @desc Get decay process statistics
 * @access Private
 * @query {string} userId - Filter by user ID
 * @query {string} workspaceId - Filter by workspace ID
 */
router.get('/decay/stats', getDecayStats);

/**
 * @route GET /api/v1/memory/decay/jobs
 * @desc Get decay job queue status
 * @access Private
 */
router.get('/decay/jobs', getDecayJobs);

/**
 * @route POST /api/v1/memory/decay/trigger
 * @desc Trigger manual memory decay job
 * @access Private
 * @body {boolean} dryRun - Run without making changes
 * @body {string} workspaceId - Optional workspace filter
 * @body {string} userId - Optional user filter
 */
router.post('/decay/trigger', triggerDecay);

/**
 * @route PATCH /api/v1/memory/decay/config
 * @desc Update decay configuration (admin only)
 * @access Private/Admin
 * SECURITY FIX (API5): Admin role enforced at route level
 */
router.patch('/decay/config', authorize('admin'), updateDecayConfig);

// ============================================================================
// Database & Infrastructure
// ============================================================================

/**
 * @route GET /api/v1/memory/database
 * @desc Get database statistics
 * @access Private
 */
router.get('/database', getDatabaseStats);

/**
 * @route GET /api/v1/memory/redis
 * @desc Get Redis memory usage statistics
 * @access Private
 */
router.get('/redis', getRedisStats);

/**
 * @route GET /api/v1/memory/hourly
 * @desc Get hourly metrics trends
 * @access Private
 * @query {number} hours - Number of hours (default: 24, max: 168)
 */
router.get('/hourly', getHourlyMetrics);

// ============================================================================
// Cache Management
// ============================================================================

/**
 * @route DELETE /api/v1/memory/conversation/:conversationId
 * @desc Clear memory cache for a specific conversation
 * @access Private
 */
router.delete('/conversation/:conversationId', clearConversationMemory);

/**
 * @route DELETE /api/v1/memory/caches
 * @desc Clear all memory caches (admin only)
 * @access Private/Admin
 * SECURITY FIX (API5): Admin role enforced at route level
 */
router.delete('/caches', authorize('admin'), clearAllCaches);

/**
 * @route DELETE /api/v1/memory/metrics
 * @desc Reset all metrics (admin only)
 * @access Private/Admin
 * SECURITY FIX (API5): Admin role enforced at route level
 */
router.delete('/metrics', authorize('admin'), resetMetrics);

export default router;
