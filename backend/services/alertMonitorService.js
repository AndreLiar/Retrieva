/**
 * Alert Monitor Service
 *
 * Runs compliance checks across all workspaces and sends email alerts to
 * workspace owners when thresholds are breached. Deduplication via the
 * Workspace.alertsSentAt map prevents repeated alerts within 20 hours.
 *
 * Checks:
 *  - Certification expiry (90 / 30 / 7 day warnings)
 *  - Contract renewal (60 days before contractEnd)
 *  - Annual review overdue (nextReviewDate < now)
 *  - Assessment overdue (no complete assessment in 12 months)
 */

import { Workspace } from '../models/Workspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { Assessment } from '../models/Assessment.js';
import emailService from './emailService.js';
import logger from '../config/logger.js';

const DEDUP_WINDOW_MS = 20 * 60 * 60 * 1000; // 20 hours

/**
 * Orchestrator — runs all 4 checks in parallel (allSettled so one failure
 * does not block the others).
 */
export async function runMonitoringAlerts() {
  logger.info('Starting monitoring alert checks', { service: 'alertMonitor' });

  const results = await Promise.allSettled([
    checkCertificationExpiry(),
    checkContractRenewal(),
    checkAnnualReviewOverdue(),
    checkAssessmentOverdue(),
  ]);

  const [certs, contracts, reviews, assessments] = results;
  if (certs.status === 'rejected')
    logger.error('Cert expiry check failed', {
      error: certs.reason?.message,
      service: 'alertMonitor',
    });
  if (contracts.status === 'rejected')
    logger.error('Contract renewal check failed', {
      error: contracts.reason?.message,
      service: 'alertMonitor',
    });
  if (reviews.status === 'rejected')
    logger.error('Annual review check failed', {
      error: reviews.reason?.message,
      service: 'alertMonitor',
    });
  if (assessments.status === 'rejected')
    logger.error('Assessment overdue check failed', {
      error: assessments.reason?.message,
      service: 'alertMonitor',
    });

  logger.info('Monitoring alert checks complete', { service: 'alertMonitor' });
}

// ---------------------------------------------------------------------------
// Check 1 — Certification expiry (90 / 30 / 7 day windows)
// ---------------------------------------------------------------------------

async function checkCertificationExpiry() {
  const workspaces = await Workspace.find({ 'certifications.0': { $exists: true } });
  const now = new Date();

  for (const workspace of workspaces) {
    for (const cert of workspace.certifications) {
      if (!cert.validUntil) continue;

      const msUntilExpiry = cert.validUntil - now;
      const daysUntilExpiry = msUntilExpiry / (24 * 60 * 60 * 1000);

      // Determine which threshold applies (most urgent wins)
      let threshold = null;
      if (daysUntilExpiry > 0 && daysUntilExpiry <= 7) threshold = 7;
      else if (daysUntilExpiry > 7 && daysUntilExpiry <= 30) threshold = 30;
      else if (daysUntilExpiry > 30 && daysUntilExpiry <= 90) threshold = 90;

      if (!threshold) continue;

      const alertKey = `cert-expiry-${threshold}-${cert.type}`;
      if (isWithinDedupWindow(workspace, alertKey)) continue;

      const alertType = `cert-expiry-${threshold}`;
      const details = {
        certType: cert.type,
        expiryDate: cert.validUntil.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      };

      await sendAlertToOwners(workspace, alertType, details);
      workspace.alertsSentAt.set(alertKey, new Date());
      await Workspace.updateOne(
        { _id: workspace._id },
        { $set: { alertsSentAt: workspace.alertsSentAt } }
      );

      logger.info('Cert expiry alert sent', {
        service: 'alertMonitor',
        workspaceId: workspace._id,
        certType: cert.type,
        threshold,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2 — Contract renewal (60 days before contractEnd)
// ---------------------------------------------------------------------------

async function checkContractRenewal() {
  const now = new Date();
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const workspaces = await Workspace.find({
    contractEnd: { $ne: null, $gte: now, $lte: in60Days },
  });

  for (const workspace of workspaces) {
    const alertKey = 'contract-renewal-60';
    if (isWithinDedupWindow(workspace, alertKey)) continue;

    const details = {
      contractEnd: workspace.contractEnd.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    };

    await sendAlertToOwners(workspace, 'contract-renewal-60', details);
    workspace.alertsSentAt.set(alertKey, new Date());
    await Workspace.updateOne(
      { _id: workspace._id },
      { $set: { alertsSentAt: workspace.alertsSentAt } }
    );

    logger.info('Contract renewal alert sent', {
      service: 'alertMonitor',
      workspaceId: workspace._id,
    });
  }
}

// ---------------------------------------------------------------------------
// Check 3 — Annual review overdue (nextReviewDate < now)
// ---------------------------------------------------------------------------

async function checkAnnualReviewOverdue() {
  const now = new Date();

  const workspaces = await Workspace.find({
    nextReviewDate: { $ne: null, $lt: now },
  });

  for (const workspace of workspaces) {
    const alertKey = 'annual-review-overdue';
    if (isWithinDedupWindow(workspace, alertKey)) continue;

    const details = {
      reviewDate: workspace.nextReviewDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    };

    await sendAlertToOwners(workspace, 'annual-review-overdue', details);
    workspace.alertsSentAt.set(alertKey, new Date());
    await Workspace.updateOne(
      { _id: workspace._id },
      { $set: { alertsSentAt: workspace.alertsSentAt } }
    );

    logger.info('Annual review overdue alert sent', {
      service: 'alertMonitor',
      workspaceId: workspace._id,
    });
  }
}

// ---------------------------------------------------------------------------
// Check 4 — Assessment overdue (no complete assessment in 12 months)
// ---------------------------------------------------------------------------

async function checkAssessmentOverdue() {
  const workspaces = await Workspace.find({});
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const perWorkspace = workspaces.map(async (workspace) => {
    const latest = await Assessment.findOne({
      workspaceId: workspace._id,
      status: 'complete',
    }).sort({ createdAt: -1 });

    const isOverdue = !latest || latest.createdAt < twelveMonthsAgo;
    if (!isOverdue) return;

    const alertKey = 'assessment-overdue-12mo';
    if (isWithinDedupWindow(workspace, alertKey)) return;

    const details = {
      lastAssessmentDate: latest
        ? latest.createdAt.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : null,
    };

    await sendAlertToOwners(workspace, 'assessment-overdue-12mo', details);
    workspace.alertsSentAt.set(alertKey, new Date());
    await Workspace.updateOne(
      { _id: workspace._id },
      { $set: { alertsSentAt: workspace.alertsSentAt } }
    );

    logger.info('Assessment overdue alert sent', {
      service: 'alertMonitor',
      workspaceId: workspace._id,
    });
  });

  await Promise.allSettled(perWorkspace);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isWithinDedupWindow(workspace, alertKey) {
  const lastSent = workspace.alertsSentAt?.get(alertKey);
  if (!lastSent) return false;
  return Date.now() - lastSent.getTime() < DEDUP_WINDOW_MS;
}

async function sendAlertToOwners(workspace, alertType, details) {
  const members = await WorkspaceMember.find({
    workspaceId: workspace._id,
    role: 'owner',
    status: 'active',
  }).populate('userId', 'email name notificationPreferences');

  for (const member of members) {
    const user = member.userId;
    if (!user?.email) continue;
    if (user.notificationPreferences?.email?.system_alert === false) continue;

    try {
      await emailService.sendMonitoringAlert({
        toEmail: user.email,
        toName: user.name,
        workspaceName: workspace.name,
        alertType,
        details,
      });
    } catch (err) {
      logger.error('Failed to send monitoring alert email', {
        service: 'alertMonitor',
        userId: user._id,
        workspaceId: workspace._id,
        alertType,
        error: err.message,
      });
    }
  }
}
