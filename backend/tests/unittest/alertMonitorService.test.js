/**
 * Unit Tests — alertMonitorService
 *
 * Repositories and emailService are mocked.
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

const { mockWorkspaceRepo, mockAssessmentRepo } = vi.hoisted(() => ({
  mockWorkspaceRepo: {
    findWithCertifications: vi.fn(),
    findByContractEndingSoon: vi.fn(),
    findDueForReview: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    updateMany: vi.fn(),
  },
  mockAssessmentRepo: {
    findLatestByWorkspace: vi.fn(),
  },
}));

vi.mock('../../repositories/index.js', () => ({
  workspaceRepository: mockWorkspaceRepo,
  assessmentRepository: mockAssessmentRepo,
}));

vi.mock('../../models/WorkspaceMember.js', () => ({
  WorkspaceMember: {
    find: vi.fn(),
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
import { WorkspaceMember } from '../../models/WorkspaceMember.js';
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
    alertsSentAt: {},
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

function setupEmptyChecks() {
  mockWorkspaceRepo.findWithCertifications.mockResolvedValue([]);
  mockWorkspaceRepo.findByContractEndingSoon.mockResolvedValue([]);
  mockWorkspaceRepo.findDueForReview.mockResolvedValue([]);
  mockWorkspaceRepo.find.mockResolvedValue([]);
  mockAssessmentRepo.findLatestByWorkspace.mockResolvedValue(null);
  mockWorkspaceRepo.updateMany.mockResolvedValue({});
}

// ─── runMonitoringAlerts ──────────────────────────────────────────────────────

describe('runMonitoringAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyChecks();
    WorkspaceMember.find.mockReturnValue({ populate: vi.fn().mockResolvedValue([]) });
  });

  it('completes without throwing even when all checks succeed with no data', async () => {
    await expect(runMonitoringAlerts()).resolves.not.toThrow();
  });

  it('does not throw when one check fails internally', async () => {
    mockWorkspaceRepo.findByContractEndingSoon.mockRejectedValue(new Error('DB down'));
    await expect(runMonitoringAlerts()).resolves.not.toThrow();
  });
});

// ─── checkCertificationExpiry (via runMonitoringAlerts) ───────────────────────

describe('Certification expiry alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyChecks();
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });
    emailService.sendMonitoringAlert.mockResolvedValue({});
  });

  it('sends 7-day cert alert when cert expires within 7 days', async () => {
    const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: expiry }],
    });
    mockWorkspaceRepo.findWithCertifications.mockResolvedValue([workspace]);

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
    mockWorkspaceRepo.findWithCertifications.mockResolvedValue([workspace]);

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
    mockWorkspaceRepo.findWithCertifications.mockResolvedValue([workspace]);

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
    mockWorkspaceRepo.findWithCertifications.mockResolvedValue([workspace]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('does NOT send alert for cert with no validUntil', async () => {
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: null }],
    });
    mockWorkspaceRepo.findWithCertifications.mockResolvedValue([workspace]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('skips alert when within 20-hour dedup window', async () => {
    const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const alertKey = 'cert-expiry-7-ISO27001';
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: expiry }],
      alertsSentAt: { [alertKey]: new Date(Date.now() - NINETEEN_HOURS_MS) },
    });
    mockWorkspaceRepo.findWithCertifications.mockResolvedValue([workspace]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('sends alert when outside 20-hour dedup window', async () => {
    const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const alertKey = 'cert-expiry-7-ISO27001';
    const workspace = makeWorkspace({
      certifications: [{ type: 'ISO27001', validUntil: expiry }],
      alertsSentAt: { [alertKey]: new Date(Date.now() - TWENTY_ONE_HOURS_MS) },
    });
    mockWorkspaceRepo.findWithCertifications.mockResolvedValue([workspace]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalled();
  });
});

// ─── checkContractRenewal ─────────────────────────────────────────────────────

describe('Contract renewal alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyChecks();
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });
    emailService.sendMonitoringAlert.mockResolvedValue({});
  });

  it('sends contract renewal alert when contract ends within 60 days', async () => {
    const contractEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({ contractEnd });
    mockWorkspaceRepo.findByContractEndingSoon.mockResolvedValue([workspace]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'contract-renewal-60' })
    );
  });

  it('skips contract renewal alert within dedup window', async () => {
    const contractEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({
      contractEnd,
      alertsSentAt: { 'contract-renewal-60': new Date(Date.now() - NINETEEN_HOURS_MS) },
    });
    mockWorkspaceRepo.findByContractEndingSoon.mockResolvedValue([workspace]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });
});

// ─── checkAnnualReviewOverdue ─────────────────────────────────────────────────

describe('Annual review overdue alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyChecks();
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });
    emailService.sendMonitoringAlert.mockResolvedValue({});
  });

  it('sends annual review overdue alert', async () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({ nextReviewDate: pastDate });
    mockWorkspaceRepo.findDueForReview.mockResolvedValue([workspace]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'annual-review-overdue' })
    );
  });

  it('skips annual review alert within dedup window', async () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const workspace = makeWorkspace({
      nextReviewDate: pastDate,
      alertsSentAt: { 'annual-review-overdue': new Date(Date.now() - NINETEEN_HOURS_MS) },
    });
    mockWorkspaceRepo.findDueForReview.mockResolvedValue([workspace]);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });
});

// ─── checkAssessmentOverdue ───────────────────────────────────────────────────

describe('Assessment overdue alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyChecks();
    WorkspaceMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([makeOwner()]),
    });
    emailService.sendMonitoringAlert.mockResolvedValue({});
  });

  it('sends assessment overdue alert when no assessment exists', async () => {
    const workspace = makeWorkspace();
    mockWorkspaceRepo.find.mockResolvedValue([workspace]);
    mockAssessmentRepo.findLatestByWorkspace.mockResolvedValue(null);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'assessment-overdue-12mo' })
    );
  });

  it('sends assessment overdue alert when last assessment is older than 12 months', async () => {
    const workspace = makeWorkspace();
    const oldAssessment = { createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) };
    mockWorkspaceRepo.find.mockResolvedValue([workspace]);
    mockAssessmentRepo.findLatestByWorkspace.mockResolvedValue(oldAssessment);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertType: 'assessment-overdue-12mo' })
    );
  });

  it('does NOT send alert when last assessment is recent (< 12 months)', async () => {
    const workspace = makeWorkspace();
    const recentAssessment = { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    mockWorkspaceRepo.find.mockResolvedValue([workspace]);
    mockAssessmentRepo.findLatestByWorkspace.mockResolvedValue(recentAssessment);

    await runMonitoringAlerts();

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });
});

// ─── sendAlertToOwners (via check functions) ──────────────────────────────────

describe('sendAlertToOwners email logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyChecks();
    emailService.sendMonitoringAlert.mockResolvedValue({});
  });

  it('skips member with no email', async () => {
    const workspace = makeWorkspace();
    mockWorkspaceRepo.find.mockResolvedValue([workspace]);
    mockAssessmentRepo.findLatestByWorkspace.mockResolvedValue(null);
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
    mockWorkspaceRepo.find.mockResolvedValue([workspace]);
    mockAssessmentRepo.findLatestByWorkspace.mockResolvedValue(null);
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
    mockWorkspaceRepo.findWithCertifications.mockResolvedValue([workspace]);
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
  });

  it('does nothing when workspace not found', async () => {
    mockWorkspaceRepo.findById.mockResolvedValue(null);

    await sendReviewReminderAlert('ws-missing');

    expect(emailService.sendMonitoringAlert).not.toHaveBeenCalled();
  });

  it('sends review-due-30 alert to owners', async () => {
    const workspace = makeWorkspace({
      nextReviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    mockWorkspaceRepo.findById.mockResolvedValue(workspace);
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
    mockWorkspaceRepo.findById.mockResolvedValue(workspace);
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
