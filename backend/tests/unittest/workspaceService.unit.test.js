import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { WorkspaceService, serializeWorkspace } from '../../services/WorkspaceService.js';
import { AppError } from '../../utils/index.js';

// ---------------------------------------------------------------------------
// Mock module-level imports so the singleton doesn't crash on load
// ---------------------------------------------------------------------------
vi.mock('../../models/Workspace.js', () => ({ Workspace: {} }));
vi.mock('../../models/WorkspaceMember.js', () => ({ WorkspaceMember: {} }));
vi.mock('../../models/OrganizationMember.js', () => ({ OrganizationMember: {} }));
vi.mock('../../models/User.js', () => ({ User: {} }));
vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../services/emailService.js', () => ({
  emailService: { sendWorkspaceInvitation: vi.fn().mockResolvedValue(undefined) },
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const WS_ID = new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa').toString();
const USER_ID = new mongoose.Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb').toString();
const MEMBER_ID = new mongoose.Types.ObjectId('cccccccccccccccccccccccc').toString();

function makeWorkspace(overrides = {}) {
  return {
    _id: { toString: () => WS_ID },
    name: 'Acme Workspace',
    description: 'test',
    syncStatus: 'idle',
    vendorTier: 'critical',
    serviceType: 'cloud',
    country: 'FR',
    contractStart: null,
    contractEnd: null,
    nextReviewDate: null,
    vendorStatus: 'active',
    certifications: [],
    vendorFunctions: [],
    exitStrategyDoc: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeOwnerMembership(overrides = {}) {
  return {
    workspaceId: { toString: () => WS_ID },
    userId: USER_ID,
    role: 'owner',
    status: 'active',
    permissions: { canQuery: true, canViewSources: true, canInvite: false },
    ...overrides,
  };
}

function makeDeps(overrides = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const emailService = { sendWorkspaceInvitation: vi.fn().mockResolvedValue(undefined) };

  const Workspace = {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    find: vi.fn(),
  };
  const WorkspaceMember = {
    findOne: vi.fn(),
    findById: vi.fn(),
    addOwner: vi.fn().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue(undefined),
    getUserWorkspaces: vi.fn(),
    getWorkspaceMembers: vi.fn(),
    inviteMember: vi.fn(),
  };
  const OrganizationMember = { findOne: vi.fn().mockResolvedValue(null) };
  const User = {
    findOne: vi.fn(),
    findById: vi.fn(),
    updateOne: vi.fn().mockReturnValue({ catch: vi.fn() }),
  };

  return {
    Workspace,
    WorkspaceMember,
    OrganizationMember,
    User,
    logger,
    emailService,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// serializeWorkspace
// ---------------------------------------------------------------------------
describe('serializeWorkspace', () => {
  it('maps all standard fields', () => {
    const ws = makeWorkspace();
    const result = serializeWorkspace(ws);
    expect(result.id).toBe(WS_ID);
    expect(result.name).toBe('Acme Workspace');
    expect(result.vendorTier).toBe('critical');
  });

  it('merges extras over base fields', () => {
    const ws = makeWorkspace();
    const result = serializeWorkspace(ws, { myRole: 'owner', joinedAt: 'today' });
    expect(result.myRole).toBe('owner');
    expect(result.joinedAt).toBe('today');
  });
});

// ---------------------------------------------------------------------------
// createWorkspace
// ---------------------------------------------------------------------------
describe('WorkspaceService.createWorkspace', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new WorkspaceService(deps);
  });

  it('creates workspace and adds owner', async () => {
    const ws = makeWorkspace();
    deps.Workspace.create.mockResolvedValue(ws);

    const result = await svc.createWorkspace(USER_ID, { name: 'Acme' });

    expect(deps.Workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme', userId: USER_ID })
    );
    expect(deps.WorkspaceMember.addOwner).toHaveBeenCalledWith(ws._id, USER_ID);
    expect(result.name).toBe('Acme Workspace');
  });

  it('attaches organizationId when creator belongs to an org', async () => {
    const orgId = new mongoose.Types.ObjectId();
    deps.OrganizationMember.findOne.mockResolvedValue({ organizationId: orgId, status: 'active' });
    deps.Workspace.create.mockResolvedValue(makeWorkspace());

    await svc.createWorkspace(USER_ID, { name: 'Acme' });

    expect(deps.Workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgId })
    );
  });

  it('fires onboarding checklist update (non-blocking)', async () => {
    deps.Workspace.create.mockResolvedValue(makeWorkspace());
    await svc.createWorkspace(USER_ID, { name: 'Acme' });
    expect(deps.User.updateOne).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getWorkspace
// ---------------------------------------------------------------------------
describe('WorkspaceService.getWorkspace', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new WorkspaceService(deps);
  });

  it('throws 403 if user is not a member', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(null);
    await expect(svc.getWorkspace(WS_ID, USER_ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 if workspace does not exist', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.Workspace.findById.mockResolvedValue(null);
    await expect(svc.getWorkspace(WS_ID, USER_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns serialized workspace with role and permissions', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.Workspace.findById.mockResolvedValue(makeWorkspace());

    const result = await svc.getWorkspace(WS_ID, USER_ID);

    expect(result.myRole).toBe('owner');
    expect(result.permissions).toBeDefined();
    expect(result.id).toBe(WS_ID);
  });
});

// ---------------------------------------------------------------------------
// updateWorkspace
// ---------------------------------------------------------------------------
describe('WorkspaceService.updateWorkspace', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new WorkspaceService(deps);
  });

  it('throws 403 if caller is not owner', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(null);
    await expect(svc.updateWorkspace(WS_ID, USER_ID, { name: 'X' })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('throws 404 if workspace not found', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.Workspace.findById.mockResolvedValue(null);
    await expect(svc.updateWorkspace(WS_ID, USER_ID, { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('updates name and calls save', async () => {
    const ws = makeWorkspace();
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.Workspace.findById.mockResolvedValue(ws);

    const result = await svc.updateWorkspace(WS_ID, USER_ID, { name: 'New Name' });

    expect(ws.name).toBe('New Name');
    expect(ws.save).toHaveBeenCalled();
    expect(result.name).toBe('New Name');
  });
});

// ---------------------------------------------------------------------------
// deleteWorkspace
// ---------------------------------------------------------------------------
describe('WorkspaceService.deleteWorkspace', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new WorkspaceService(deps);
  });

  it('throws 403 if caller is not owner', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(null);
    await expect(svc.deleteWorkspace(WS_ID, USER_ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('deletes members then workspace', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.Workspace.findByIdAndDelete.mockResolvedValue(undefined);

    await svc.deleteWorkspace(WS_ID, USER_ID);

    expect(deps.WorkspaceMember.deleteMany).toHaveBeenCalledWith({ workspaceId: WS_ID });
    expect(deps.Workspace.findByIdAndDelete).toHaveBeenCalledWith(WS_ID);
  });
});

// ---------------------------------------------------------------------------
// getMyWorkspaces
// ---------------------------------------------------------------------------
describe('WorkspaceService.getMyWorkspaces', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new WorkspaceService(deps);
  });

  it('returns org workspaces with org role when user is org member', async () => {
    deps.OrganizationMember.findOne.mockResolvedValue({
      organizationId: 'org-1',
      role: 'org_admin',
      joinedAt: new Date(),
    });
    deps.Workspace.find.mockResolvedValue([makeWorkspace()]);

    const result = await svc.getMyWorkspaces(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].myRole).toBe('owner');
    expect(result[0].permissions.canInvite).toBe(true);
  });

  it('returns direct memberships when user has no org', async () => {
    deps.OrganizationMember.findOne.mockResolvedValue(null);
    const ws = makeWorkspace();
    deps.WorkspaceMember.getUserWorkspaces.mockResolvedValue([
      { workspaceId: ws, role: 'member', permissions: {}, invitedAt: new Date() },
    ]);

    const result = await svc.getMyWorkspaces(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].myRole).toBe('member');
  });
});

// ---------------------------------------------------------------------------
// inviteMember
// ---------------------------------------------------------------------------
describe('WorkspaceService.inviteMember', () => {
  let deps;
  let svc;
  const inviteeId = new mongoose.Types.ObjectId('eeeeeeeeeeeeeeeeeeeeeeee');

  beforeEach(() => {
    deps = makeDeps();
    svc = new WorkspaceService(deps);
    deps.Workspace.findById.mockResolvedValue(makeWorkspace());
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.User.findOne.mockResolvedValue({ _id: inviteeId, email: 'bob@example.com', name: 'Bob' });
    deps.User.findById.mockReturnValue({
      select: vi.fn().mockResolvedValue({ name: 'Alice', email: 'alice@example.com' }),
    });
    deps.WorkspaceMember.inviteMember.mockResolvedValue({
      _id: MEMBER_ID,
      role: 'member',
      status: 'active',
    });
  });

  it('throws 404 if invitee is not registered', async () => {
    deps.User.findOne.mockResolvedValue(null);
    await expect(
      svc.inviteMember(WS_ID, USER_ID, { email: 'x@x.com', role: 'member' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 if inviter is not a member', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(null);
    await expect(
      svc.inviteMember(WS_ID, USER_ID, { email: 'bob@example.com', role: 'member' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 409 if user is already a member', async () => {
    deps.WorkspaceMember.inviteMember.mockRejectedValue(
      new Error('already a member of this workspace')
    );
    await expect(
      svc.inviteMember(WS_ID, USER_ID, { email: 'bob@example.com', role: 'member' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns membership data and fires invitation email', async () => {
    const result = await svc.inviteMember(WS_ID, USER_ID, {
      email: 'bob@example.com',
      role: 'member',
    });

    expect(result.membership.email).toBe('bob@example.com');
    expect(result.inviteeName).toBe('Bob');
    expect(result.workspaceName).toBe('Acme Workspace');
    expect(deps.emailService.sendWorkspaceInvitation).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// revokeMember
// ---------------------------------------------------------------------------
describe('WorkspaceService.revokeMember', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new WorkspaceService(deps);
  });

  it('throws 403 if requester is not owner', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(null);
    await expect(svc.revokeMember(WS_ID, USER_ID, MEMBER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('throws 404 if member not found', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.WorkspaceMember.findById.mockResolvedValue(null);
    await expect(svc.revokeMember(WS_ID, USER_ID, MEMBER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 400 when trying to revoke an owner', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.WorkspaceMember.findById.mockResolvedValue({
      workspaceId: { toString: () => WS_ID },
      role: 'owner',
      save: vi.fn(),
    });
    await expect(svc.revokeMember(WS_ID, USER_ID, MEMBER_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('sets status to revoked', async () => {
    const member = {
      workspaceId: { toString: () => WS_ID },
      role: 'member',
      status: 'active',
      userId: 'u2',
      save: vi.fn(),
    };
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.WorkspaceMember.findById.mockResolvedValue(member);

    await svc.revokeMember(WS_ID, USER_ID, MEMBER_ID);

    expect(member.status).toBe('revoked');
    expect(member.save).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateMember
// ---------------------------------------------------------------------------
describe('WorkspaceService.updateMember', () => {
  let deps;
  let svc;

  beforeEach(() => {
    deps = makeDeps();
    svc = new WorkspaceService(deps);
  });

  it('throws 403 if requester is not owner', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(null);
    await expect(
      svc.updateMember(WS_ID, USER_ID, MEMBER_ID, { role: 'viewer' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 when trying to modify owner', async () => {
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.WorkspaceMember.findById.mockResolvedValue({
      workspaceId: { toString: () => WS_ID },
      role: 'owner',
      save: vi.fn(),
    });
    await expect(
      svc.updateMember(WS_ID, USER_ID, MEMBER_ID, { role: 'viewer' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('updates role and saves', async () => {
    const member = {
      workspaceId: { toString: () => WS_ID },
      role: 'member',
      permissions: { canQuery: true, canViewSources: true, canInvite: false },
      save: vi.fn().mockResolvedValue(undefined),
    };
    deps.WorkspaceMember.findOne.mockResolvedValue(makeOwnerMembership());
    deps.WorkspaceMember.findById.mockResolvedValue(member);

    await svc.updateMember(WS_ID, USER_ID, MEMBER_ID, { role: 'viewer' });

    expect(member.role).toBe('viewer');
    expect(member.save).toHaveBeenCalled();
  });
});
