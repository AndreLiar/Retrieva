import express from 'express';
import {
  basicHealth,
  detailedHealth,
  readinessCheck,
  livenessCheck,
} from '../controllers/healthController.js';

const router = express.Router();

/**
 * @route   GET /api/v1/health
 * @desc    Basic health check
 * @access  Public
 */
router.get('/', basicHealth);

/**
 * @route   GET /api/v1/health/detailed
 * @desc    Detailed health check with all dependencies
 * @access  Public
 */
router.get('/detailed', detailedHealth);

/**
 * @route   GET /api/v1/health/ready
 * @desc    Readiness check (Kubernetes)
 * @access  Public
 */
router.get('/ready', readinessCheck);

/**
 * @route   GET /api/v1/health/live
 * @desc    Liveness check (Kubernetes)
 * @access  Public
 */
router.get('/live', livenessCheck);

export default router;
