/**
 * Retrieva Email Service — Composition Root
 *
 * Wires domain, application, infrastructure, and interface layers together.
 * Nothing else in the codebase should do this wiring.
 */
import 'dotenv/config';
import express from 'express';
import { ResendEmailAdapter } from './src/infrastructure/adapters/ResendEmailAdapter.js';
import { EmailApplicationService } from './src/application/EmailApplicationService.js';
import { createEmailRouter } from './src/interface/http/createRouter.js';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT) || 3008;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// ── Infrastructure ────────────────────────────────────────────────────────────

const emailSender = new ResendEmailAdapter({
  apiKey: process.env.RESEND_API_KEY,
  fromName: process.env.SMTP_FROM_NAME || 'Retrieva',
  fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@retrieva.online',
});

// ── Application ───────────────────────────────────────────────────────────────

const emailService = new EmailApplicationService({
  emailSender,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
});

// ── Interface ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10kb' }));

// Optional internal API key guard
app.use('/internal', (req, res, next) => {
  if (INTERNAL_API_KEY && req.headers['x-internal-api-key'] !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Liveness probe (no auth required)
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'email-service' }));

app.use('/internal/email', createEmailRouter(emailService));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[email-service] Running on :${PORT}`);
  console.log(`[email-service] Resend configured: ${!!process.env.RESEND_API_KEY}`);
});
