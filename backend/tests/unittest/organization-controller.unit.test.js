/**
 * Unit Tests — Organization Controller
 *
 * Tests: createOrganization, getMyOrganization, inviteMember,
 *        getMembers, removeMember, getInviteInfo
 *
 * All DB / email / logger dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../utils/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    catchAsync: (fn) => async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (err) {
        next(err);
      }
    },
  };
});

vi.mock('../../services/emailService.js', () => ({
  emailService: {
    sendOrganizationInvitation: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../utils/security/fieldEncryption.js', () => ({
  safeDecrypt: vi.fn((v) => v),
  safeEncrypt: vi.fn((v) => v),
}));

const ORG_OID = new mongoose.Types.ObjectId('cccccccccccccccccccccccc');
const USER_OID = new mongoose.Types.ObjectId('dddddddddddddddddddddddd');
const MBR_OID = new mongoose.Types.ObjectId('eeeeeeeeeeeeeeeeeeeeeeee');

const mockOrg = {
  _id: ORG_OID,
  name: 'HDI Global SE',
  industry: 'insurance',
  country: 'Germany',
};

const mockUser = {
  _id: USER_OID,
  email: 'alice@hdi.de',
  name: 'Alice',
};

const mockActiveMembership = {
  _id: MBR_OID,
  organizationId: ORG_OID,
  userId: USER_OID,
  email: 'alice@hdi.de',
  role: 'org_admin',
  status: 'active',
  joinedAt: new Date(),
  populate: vi.fn().mockReturnThis(),
};

vi.mock('../../models/Organization.js', () => ({
  Organization: {
    create: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../../models/OrganizationMember.js', () => ({
  OrganizationMember: {
    findOne: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
    createInvite: vi.fn(),
    findByToken: vi.fn(),
    activate: vi.fn(),
  },
}));

vi.mock('../../models/User.js', () => ({
  User: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Subject imports (AFTER mocks)
// ---------------------------------------------------------------------------

import {
  createOrganization,
  getMyOrganization,
  inviteMember,
  getMembers,
  removeMember,
  getInviteInfo,
} from '../../controllers/organizationController.js';
import { Organization } from '../../models/Organization.js';
import { OrganizationMember } from '../../models/OrganizationMember.js';
import { User } from '../../models/User.js';
import { emailService } from '../../services/emailService.js';
import { safeDecrypt } from '../../utils/security/fieldEncryption.js';

// ---------------------------------------------------------------------------
// Shared beforeEach — clear all mocks then restore pass-through utilities
// so vi.clearAllMocks() doesn't strip implementations used by the controller
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  safeDecrypt.mockImplementation((v) => v);
  emailService.sendOrganizationInvitation.mockResolvedValue({ success: true });
});

// ---------------------------------------------------------------------------
// Helper: minimal req/res/next
// ---------------------------------------------------------------------------

function makeCtx(body = {}, params = {}, query = {}) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const req = {
    user: { userId: USER_OID.toString(), email: 'alice@hdi.de', name: 'Alice' },
    body,
    params,
    query,
  };
  const next = vi.fn();
  return { req, res, next };
}

// ---------------------------------------------------------------------------
// createOrganization
// ---------------------------------------------------------------------------

describe('createOrganization', () => {
  it('returns 400 when name is missing', async () => {
    const { req, res, next } = makeCtx({ industry: 'banking' });
    await createOrganization(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 409 when user already belongs to an org', async () => {
    OrganizationMember.findOne.mockResolvedValue(mockActiveMembership);
    const { req, res, next } = makeCtx({ name: 'HDI Global SE' });
    await createOrganization(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('creates org, member and updates user, returns 201', async () => {
    OrganizationMember.findOne.mockResolvedValue(null);
    Organization.create.mockResolvedValue(mockOrg);
    User.findById.mockResolvedValue(mockUser);
    OrganizationMember.create.mockResolvedValue({});
    User.findByIdAndUpdate.mockResolvedValue({});

    const { req, res, next } = makeCtx({
      name: 'HDI Global SE',
      industry: 'insurance',
      country: 'Germany',
    });
    await createOrganization(req, res, next);

    expect(Organization.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'HDI Global SE', industry: 'insurance' })
    );
    expect(OrganizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'org_admin', status: 'active' })
    );
    expect(User.findByIdAndUpdate).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns org object in response', async () => {
    OrganizationMember.findOne.mockResolvedValue(null);
    Organization.create.mockResolvedValue(mockOrg);
    User.findById.mockResolvedValue(mockUser);
    OrganizationMember.create.mockResolvedValue({});
    User.findByIdAndUpdate.mockResolvedValue({});

    const { req, res, next } = makeCtx({ name: 'HDI Global SE' });
    await createOrganization(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.data.organization.name).toBe('HDI Global SE');
  });
});

// ---------------------------------------------------------------------------
// getMyOrganization
// ---------------------------------------------------------------------------

describe('getMyOrganization', () => {
  it('returns organization: null when user has no membership', async () => {
    OrganizationMember.findOne.mockReturnValue({
      populate: vi.fn().mockResolvedValue(null),
    });
    const { req, res, next } = makeCtx();
    await getMyOrganization(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body.data.organization).toBeNull();
    expect(body.data.role).toBeNull();
  });

  it('returns org details and role when membership exists', async () => {
    const populated = {
      ...mockActiveMembership,
      organizationId: { _id: ORG_OID, name: 'HDI', industry: 'insurance', country: 'DE' },
    };
    OrganizationMember.findOne.mockReturnValue({
      populate: vi.fn().mockResolvedValue(populated),
    });

    const { req, res, next } = makeCtx();
    await getMyOrganization(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body.data.organization.name).toBe('HDI');
    expect(body.data.role).toBe('org_admin');
  });
});

// ---------------------------------------------------------------------------
// inviteMember
// ---------------------------------------------------------------------------

describe('inviteMember', () => {
  it('returns 400 when email is missing', async () => {
    const { req, res, next } = makeCtx({ role: 'analyst' });
    await inviteMember(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid role', async () => {
    const { req, res, next } = makeCtx({ email: 'bob@hdi.de', role: 'superuser' });
    await inviteMember(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 403 when caller is not an org member', async () => {
    OrganizationMember.findOne.mockResolvedValue(null);
    const { req, res, next } = makeCtx({ email: 'bob@hdi.de', role: 'analyst' });
    await inviteMember(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when caller is not org_admin', async () => {
    OrganizationMember.findOne.mockResolvedValue({ ...mockActiveMembership, role: 'analyst' });
    const { req, res, next } = makeCtx({ email: 'bob@hdi.de', role: 'viewer' });
    await inviteMember(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 409 when email is already an active member', async () => {
    OrganizationMember.findOne
      .mockResolvedValueOnce(mockActiveMembership) // caller lookup
      .mockResolvedValueOnce({ email: 'bob@hdi.de', status: 'active' }); // existing check

    const { req, res, next } = makeCtx({ email: 'bob@hdi.de', role: 'analyst' });
    await inviteMember(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('creates invite and returns 201', async () => {
    const newMember = { _id: MBR_OID, email: 'bob@hdi.de', role: 'analyst', status: 'pending' };

    OrganizationMember.findOne
      .mockResolvedValueOnce(mockActiveMembership)
      .mockResolvedValueOnce(null);

    OrganizationMember.createInvite.mockResolvedValue({ member: newMember, rawToken: 'tok123' });
    Organization.findById.mockResolvedValue(mockOrg);
    User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });

    const { req, res, next } = makeCtx({ email: 'bob@hdi.de', role: 'analyst' });
    await inviteMember(req, res, next);

    expect(OrganizationMember.createInvite).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);

    const body = res.json.mock.calls[0][0];
    expect(body.data.member.email).toBe('bob@hdi.de');
  });
});

// ---------------------------------------------------------------------------
// getMembers
// ---------------------------------------------------------------------------

describe('getMembers', () => {
  it('returns 403 when caller has no membership', async () => {
    OrganizationMember.findOne.mockResolvedValue(null);
    const { req, res, next } = makeCtx();
    await getMembers(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns member list with id, email, role, status', async () => {
    OrganizationMember.findOne.mockResolvedValue(mockActiveMembership);
    OrganizationMember.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([
        {
          _id: MBR_OID,
          email: 'alice@hdi.de',
          role: 'org_admin',
          status: 'active',
          joinedAt: new Date(),
          userId: { _id: USER_OID, name: 'Alice', email: 'alice@hdi.de' },
        },
      ]),
    });

    const { req, res, next } = makeCtx();
    await getMembers(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0].email).toBe('alice@hdi.de');
    expect(body.data.members[0].role).toBe('org_admin');
    expect(body.data.members[0].user.name).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

describe('removeMember', () => {
  it('returns 403 when caller is not org_admin', async () => {
    OrganizationMember.findOne.mockResolvedValue({ ...mockActiveMembership, role: 'analyst' });
    const { req, res, next } = makeCtx({}, { memberId: MBR_OID.toString() });
    await removeMember(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when target member not found', async () => {
    OrganizationMember.findOne.mockResolvedValue(mockActiveMembership);
    OrganizationMember.findById.mockResolvedValue(null);
    const { req, res, next } = makeCtx({}, { memberId: MBR_OID.toString() });
    await removeMember(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when attempting to remove the only org admin', async () => {
    const callerMembership = { ...mockActiveMembership, userId: USER_OID.toString() };
    OrganizationMember.findOne.mockResolvedValue(callerMembership);
    OrganizationMember.findById.mockResolvedValue({
      ...callerMembership,
      userId: USER_OID.toString(),
    });
    OrganizationMember.countDocuments.mockResolvedValue(1); // only one admin

    const { req, res, next } = makeCtx({}, { memberId: MBR_OID.toString() });
    await removeMember(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('revokes membership and returns 200', async () => {
    const targetOID = new mongoose.Types.ObjectId('ffffffffffffffffffffffff');
    OrganizationMember.findOne.mockResolvedValue(mockActiveMembership);
    OrganizationMember.findById.mockResolvedValue({
      _id: targetOID,
      organizationId: ORG_OID,
      userId: new mongoose.Types.ObjectId('111111111111111111111111'),
    });
    OrganizationMember.findByIdAndUpdate.mockResolvedValue({});

    const { req, res, next } = makeCtx({}, { memberId: targetOID.toString() });
    await removeMember(req, res, next);

    expect(OrganizationMember.findByIdAndUpdate).toHaveBeenCalledWith(targetOID.toString(), {
      status: 'revoked',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ---------------------------------------------------------------------------
// getInviteInfo (public endpoint)
// ---------------------------------------------------------------------------

describe('getInviteInfo', () => {
  it('returns 400 when token is missing', async () => {
    const { req, res, next } = makeCtx({}, {}, {});
    await getInviteInfo(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when token is invalid/expired', async () => {
    OrganizationMember.findByToken.mockResolvedValue(null);
    const { req, res, next } = makeCtx({}, {}, { token: 'badtoken' });
    await getInviteInfo(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns invite info when token is valid', async () => {
    OrganizationMember.findByToken.mockResolvedValue({
      organizationId: ORG_OID,
      role: 'analyst',
      email: 'bob@hdi.de',
      invitedBy: USER_OID,
    });
    Organization.findById.mockResolvedValue(mockOrg);
    User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });

    const { req, res, next } = makeCtx({}, {}, { token: 'validtoken' });
    await getInviteInfo(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.data.organizationName).toBe('HDI Global SE');
    expect(body.data.role).toBe('analyst');
    expect(body.data.email).toBe('bob@hdi.de');
  });
});
