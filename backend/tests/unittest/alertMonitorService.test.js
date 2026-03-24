/**
 * Unit Tests — alertMonitorService
 *
 * All DB models and emailService are mocked.
 * Tests cover the 4 monitoring checks + dedup + sendReviewReminderAlert.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../models/Workspace.js', () => ({
  Workspace: {
    find: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../../models/WorkspaceMember.js', () => ({
  WorkspaceMember: {
    find: vi.fn(),
  },
}));

vi.mock('../../models/Assessment.js', () => ({
  Assessment: {
    findOne: vi.fn(),
  },
}));

vi.mock('../../services/emailService.js', () => ({
  default: {
    sendMonitoringAlert: vi.fn(),
  },
}));

import {
  runMonitoringAlerts,
  sendReviewReminderAlert,
} from '../../services/alertMonitorService.js';
import { Workspace } from '../../models/Workspace.js';
import { WorkspaceMember } from '../../models/WorkspaceMember.js';
import { Assessment } from '../../models/Assessment.js';
import emailService from '../../services/emailService.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TWENTY_ONE_HOURS_MS = 21 * 60 * 60 * 1000;
const NINETEEN_HOURS_MS = 19 * 60 * 60 * 1000;

function makeWorkspace(overrides = {}) {
  return {
    _id: 'ws-1',
    name: 'Test Vendor',
    certifications: [],
    contractEnd: null,
    nextReviewDate: null,
    alertsSentAt: new Map(),
    ...overrides,
  };
}

function makeOwner(overrides = {}) {
  return {
    userId: {
      _id: 'user-1',
      email: 'owner@example.com',
      name: 'Alice',
      notificationPreferences: {},
      ...overrides,
    },
  };
}

// ─── runMonitoringAlerts ──────────────────────────────────────────────────────

describe('runMonitoringAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Workspace.find.mockResolvedValue([]);
    Workspace.updateOne.mockResolvedValue({});
    WorkspaceMember.find.mockReturnValue({ populate: vi.fn().mockResolvedValue([]) });
    Assessment.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
  });

  it('completes without throwing even when all checks succeed with no data', async () => {
    await expect(runMonitoringAlerts()).resolves.not.toThrow();
  });

  it('does not throw when one check fails internally', async () => {
    // First call succeeds (certifications), subsequent fail
    Workspace.find
      .mockResolvedValueOnce([]) // checkCertificationExpiry
      .mockRejectedValueOnce(new Error('DB down')) // checkContractRenewal
      .mockResolvedValueOnce([]) // checkAnnualReviewOverdue
      .mockResolvedValueOnce([]); // checkAssessmentOverdue

    await expect(runMonitoringAlerts()).resolves.not.toThrow();
  });
});

// ─── checkCertificationExpiry (via runMonitoringAlerts) ───────────────────────

describe('Certification expiry alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Workspace.updateOne.mockResolvedValue({});
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });
    emailService.sendMonitoringAlert.mockResolvedValue({});
    Assessment.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
  });

  it('sends 7-day cert alert when cert expires within 7 days', async () => {
    const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: expiry }],
    });

    Workspace.find
      .mockResolvedValueOnce([workspace]) // checkCertificationExpiry
      .mockResolvedValueOnce([]) // checkContractRenewal
      .mockResolvedValueOnce([]) // checkAnnualReviewOverdue
      .mockResolvedValueOnce([]); // checkAssessmentOverdue

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'cert-expiry-7' })
    );
  });

  it('sends 30-day cert alert when cert expires in 15 days', async () => {
    const expiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({
      certifications: [{ type: 'SOC2', validUntil: expiry }],
    });

    Workspace.find
      .mockResolvedValueOnce([workspace])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'cert-expiry-30' })
    );
  });

  it('sends 90-day cert alert when cert expires in 60 days', async () => {
    const expiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({
      certifications: [{ type: 'PCI-DSS', validUntil: expiry }],
    });

    Workspace.find
      .mockResolvedValueOnce([workspace])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'cert-expiry-90' })
    );
  });

  it('does NOT send alert for cert expiring in 120 days (outside all windows)', async () => {
    const expiry = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: expiry }],
    });

    Workspace.find
      .mockResolvedValueOnce([workspace])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('does NOT send alert for cert with no validUntil', async () => {
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: null }],
    });

    Workspace.find
      .mockResolvedValueOnce([workspace])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('skips alert when within 20-hour dedup window', async () => {
    const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const alertKey = 'cert-expiry-7-ISO27001';
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: expiry }],
      alertsSentAt: new Map([[alertKey, new Date(Date.now() - NINETEEN_HOURS_MS)]]), // sent 19h ago
    });

    Workspace.find
      .mockResolvedValueOnce([workspace])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('sends alert when outside 20-hour dedup window', async () => {
    const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const alertKey = 'cert-expiry-7-ISO27001';
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: expiry }],
      alertsSentAt: new Map([[alertKey, new Date(Date.now() - TWENTY_ONE_HOURS_MS)]]), // sent 21h ago
    });

    Workspace.find
      .mockResolvedValueOnce([workspace])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalled();
  });
});

// ─── checkContractRenewal ─────────────────────────────────────────────────────

describe('Contract renewal alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Workspace.updateOne.mockResolvedValue({});
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });
    emailService.sendMonitoringAlert.mockResolvedValue({});
    Assessment.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
  });

  it('sends contract renewal alert when contract ends within 60 days', async () => {
    const contractEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({ contractEnd });

    Workspace.find
      .mockResolvedValueOnce([]) // checkCertificationExpiry
      .mockResolvedValueOnce([workspace]) // checkContractRenewal
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'contract-renewal-60' })
    );
  });

  it('skips contract renewal alert within dedup window', async () => {
    const contractEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({
      contractEnd,
      alertsSentAt: new Map([['contract-renewal-60', new Date(Date.now() - NINETEEN_HOURS_MS)]]),
    });

    Workspace.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });
});

// ─── checkAnnualReviewOverdue ─────────────────────────────────────────────────

describe('Annual review overdue alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Workspace.updateOne.mockResolvedValue({});
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });
    emailService.sendMonitoringAlert.mockResolvedValue({});
    Assessment.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
  });

  it('sends annual review overdue alert', async () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({ nextReviewDate: pastDate });

    Workspace.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace]) // checkAnnualReviewOverdue
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'annual-review-overdue' })
    );
  });

  it('skips annual review alert within dedup window', async () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({
      nextReviewDate: pastDate,
      alertsSentAt: new Map([['annual-review-overdue', new Date(Date.now() - NINETEEN_HOURS_MS)]]),
    });

    Workspace.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace])
      .mockResolvedValueOnce([]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });
});

// ─── checkAssessmentOverdue ───────────────────────────────────────────────────

describe('Assessment overdue alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Workspace.updateOne.mockResolvedValue({});
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });
    emailService.sendMonitoringAlert.mockResolvedValue({});
  });

  it('sends assessment overdue alert when no assessment exists', async () => {
    const workspace = makeWorkspace();

    Workspace.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace]); // checkAssessmentOverdue

    Assessment.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'assessment-overdue-12mo' })
    );
  });

  it('sends assessment overdue alert when last assessment is older than 12 months', async () => {
    const workspace = makeWorkspace();
    const oldAssessment = { createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) };

    Workspace.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace]);

    Assessment.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(oldAssessment) });

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'assessment-overdue-12mo' })
    );
  });

  it('does NOT send alert when last assessment is recent (< 12 months)', async () => {
    const workspace = makeWorkspace();
    const recentAssessment = { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };

    Workspace.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace]);

    Assessment.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(recentAssessment) });

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });
});

// ─── sendAlertToOwners (via check functions) ──────────────────────────────────

describe('sendAlertToOwners email logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Workspace.updateOne.mockResolvedValue({});
    Assessment.findOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
    emailService.sendMonitoringAlert.mockResolvedValue({});
  });

  it('skips member with no email', async () => {
    const workspace = makeWorkspace();

    Workspace.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace]);

    WorkspaceMember.find.mockReturnValue({
      populate: vi
        .fn()
        .mockResolvedValue([{ userId: { _id: 'u1', email: null, name: 'No Email' } }]),
    });

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('skips member who opted out of system alerts', async () => {
    const workspace = makeWorkspace();

    Workspace.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([workspace]);

    WorkspaceMember.find.mockReturnValue({
      populate: vi
        .fn()
        .mockResolvedValue([
          makeOwner({ notificationPreferences: { email: { system_alert: false } } }),
        ]),
    });

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('continues sending to other owners if one email fails', async () => {
    const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: expiry }],
    });

    Workspace.find
      .mockResolvedValueOnce([workspace])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    WorkspaceMember.find.mockReturnValue({
      populate: vi
        .fn()
        .mockResolvedValue([
          makeOwner({ email: 'fail@example.com' }),
          makeOwner({ email: 'success@example.com' }),
        ]),
    });

    emailService.sendMonitoringAlert
      .mockRejectedValueOnce(new Error('SMTP error'))
      .mockResolvedValueOnce({});

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledTimes(2);
  });
});

// ─── sendReviewReminderAlert ──────────────────────────────────────────────────

describe('sendReviewReminderAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailService.sendMonitoringAlert.mockResolvedValue({});
    Workspace.updateOne.mockResolvedValue({});
  });

  it('does nothing when workspace not found', async () => {
    Workspace.findById.mockResolvedValue(null);

    await sendReviewReminderAlert('ws-missing');

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('sends review-due-30 alert to owners', async () => {
    const workspace = makeWorkspace({
      nextReviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    Workspace.findById.mockResolvedValue(workspace);
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });

    await sendReviewReminderAlert('ws-1');

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: 'review-due-30',
        toEmail: 'owner@example.com',
        workspaceName: 'Test Vendor',
      })
    );
  });

  it('uses "soon" as reviewDate when nextReviewDate is not set', async () => {
    const workspace = makeWorkspace({ nextReviewDate: null });
    Workspace.findById.mockResolvedValue(workspace);
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });

    await sendReviewReminderAlert('ws-1');

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ reviewDate: 'soon' }),
      })
    );
  });
});
