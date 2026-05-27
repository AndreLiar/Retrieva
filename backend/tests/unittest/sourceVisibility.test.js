import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the repository the helper depends on.
const findMembership = vi.fn();
vi.mock('../../repositories/WorkspaceMemberRepository.js', () => ({
  workspaceMemberRepository: {
    findMembership: (...args) => findMembership(...args),
  },
}));

const { userCanViewSources } = await import('../../utils/security/sourceVisibility.js');

const WS = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('userCanViewSources (B1)', () => {
  beforeEach(() => {
    findMembership.mockReset();
  });

  it('fails open (true) when no workspaceId can be resolved', async () => {
    expect(await userCanViewSources({}, undefined)).toBe(true);
    expect(findMembership).not.toHaveBeenCalled();
  });

  it('uses already-loaded authorizedWorkspaces and denies on explicit false', async () => {
    const req = {
      authorizedWorkspaces: [{ workspaceId: WS, permissions: { canViewSources: false } }],
    };
    expect(await userCanViewSources(req, WS)).toBe(false);
    expect(findMembership).not.toHaveBeenCalled(); // no extra DB hit
  });

  it('allows when loaded permission is true', async () => {
    const req = {
      authorizedWorkspaces: [{ workspaceId: WS, permissions: { canViewSources: true } }],
    };
    expect(await userCanViewSources(req, WS)).toBe(true);
  });

  it('looks up membership when not preloaded and denies on explicit false', async () => {
    findMembership.mockResolvedValue({ permissions: { canViewSources: false } });
    const req = { user: { userId: 'u1' } };
    expect(await userCanViewSources(req, WS)).toBe(false);
    expect(findMembership).toHaveBeenCalledWith(WS, 'u1');
  });

  it('fails open when no membership row is found', async () => {
    findMembership.mockResolvedValue(null);
    const req = { user: { userId: 'u1' } };
    expect(await userCanViewSources(req, WS)).toBe(true);
  });

  it('fails open when unauthenticated and not preloaded', async () => {
    expect(await userCanViewSources({}, WS)).toBe(true);
    expect(findMembership).not.toHaveBeenCalled();
  });
});
