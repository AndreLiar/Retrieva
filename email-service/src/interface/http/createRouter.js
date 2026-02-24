/**
 * Interface Layer: HTTP Router
 *
 * Express Router factory. Depends on EmailApplicationService (injected).
 * Does not know about Resend, HTML templates, or any infrastructure details.
 */
import { Router } from 'express';

/**
 * @param {import('../../application/EmailApplicationService').EmailApplicationService} emailService
 * @returns {import('express').Router}
 */
export function createEmailRouter(emailService) {
  const router = Router();

  router.post('/send', async (req, res) => {
    try {
      res.json(await emailService.sendEmail(req.body));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/workspace-invitation', async (req, res) => {
    try {
      res.json(await emailService.sendWorkspaceInvitation(req.body));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/welcome', async (req, res) => {
    try {
      res.json(await emailService.sendWelcomeEmail(req.body));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/password-reset', async (req, res) => {
    try {
      res.json(await emailService.sendPasswordResetEmail(req.body));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/email-verification', async (req, res) => {
    try {
      res.json(await emailService.sendEmailVerification(req.body));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/health', async (_req, res) => {
    try {
      const connected = await emailService.verifyConnection();
      res.json(connected ? { connected: true } : { connected: false, reason: 'not-configured' });
    } catch (err) {
      res.json({ connected: false, error: err.message });
    }
  });

  return router;
}
