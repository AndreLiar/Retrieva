import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  setTenantContext,
  getCurrentTenantId,
  getCurrentUserId,
} from '../../services/tenantIsolation.js';

describe('setTenantContext (B2)', () => {
  it('reads the active workspace from the X-Workspace-Id header', () => {
    const req = { headers: { 'x-workspace-id': 'ws-1' }, user: { userId: 'u1' } };
    let captured;
    setTenantContext(req, {}, () => {
      captured = { ws: getCurrentTenantId(), user: getCurrentUserId() };
    });
    expect(captured).toEqual({ ws: 'ws-1', user: 'u1' });
  });

  it('falls back to body, then query workspaceId', () => {
    let fromBody;
    setTenantContext({ headers: {}, body: { workspaceId: 'ws-b' } }, {}, () => {
      fromBody = getCurrentTenantId();
    });
    expect(fromBody).toBe('ws-b');

    let fromQuery;
    setTenantContext({ headers: {}, query: { workspaceId: 'ws-q' } }, {}, () => {
      fromQuery = getCurrentTenantId();
    });
    expect(fromQuery).toBe('ws-q');
  });

  it('prefers a loaded req.workspace over the header', () => {
    const req = {
      workspace: { _id: { toString: () => 'ws-loaded' } },
      headers: { 'x-workspace-id': 'ws-h' },
    };
    let ws;
    setTenantContext(req, {}, () => {
      ws = getCurrentTenantId();
    });
    expect(ws).toBe('ws-loaded');
  });

  it('still calls next() when there is no workspace or user', () => {
    const next = vi.fn();
    setTenantContext({ headers: {} }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('exposes no tenant id outside of a request context', () => {
    expect(getCurrentTenantId()).toBeNull();
  });
});
