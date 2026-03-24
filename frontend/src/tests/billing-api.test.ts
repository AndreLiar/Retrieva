/**
 * Frontend Tests — billingApi
 *
 * Mocks the Axios client and covers the single createPortalSession() method.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock apiClient BEFORE importing billingApi
// ---------------------------------------------------------------------------
const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));

vi.mock('@/lib/api/client', () => ({
  default: { post: mockPost },
}));

import { billingApi } from '@/lib/api/billing';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('billingApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPortalSession()', () => {
    it('calls POST /billing/portal', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { url: 'https://billing.stripe.com/session/abc' } },
      });

      await billingApi.createPortalSession();

      expect(mockPost).toHaveBeenCalledOnce();
      expect(mockPost).toHaveBeenCalledWith('/billing/portal');
    });

    it('returns the portal URL from response data', async () => {
      const portalUrl = 'https://billing.stripe.com/session/abc123';
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { url: portalUrl } },
      });

      const result = await billingApi.createPortalSession();

      expect(result.data!.url).toBe(portalUrl);
    });

    it('propagates errors thrown by apiClient', async () => {
      mockPost.mockRejectedValue(new Error('Network Error'));

      await expect(billingApi.createPortalSession()).rejects.toThrow('Network Error');
    });

    it('propagates 403 Forbidden errors', async () => {
      const err = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
      mockPost.mockRejectedValue(err);

      await expect(billingApi.createPortalSession()).rejects.toMatchObject({
        response: { status: 403 },
      });
    });
  });
});
