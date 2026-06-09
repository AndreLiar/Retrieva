import { describe, it, expect } from 'vitest';
import { buildRateLimitKey } from '../../middleware/authRateLimiter.js';

/**
 * #381 — the auth limiters must key on the IPv6 *subnet*, not the exact address,
 * so a single /64 allocation can't rotate through ~18 quintillion addresses to
 * bypass the per-IP cap.
 */
describe('authRateLimiter — IPv6-safe key generation (#381)', () => {
  it('two IPv6 addresses in the same allocation share one key', () => {
    const a = buildRateLimitKey('login', '2001:db8:1234:5678:aaaa:bbbb:cccc:dddd');
    const b = buildRateLimitKey('login', '2001:db8:1234:5678:1111:2222:3333:4444');
    expect(a).toBe(b);
  });

  it('IPv6 addresses in different allocations get different keys', () => {
    const a = buildRateLimitKey('login', '2001:db8:1234:5678::1');
    const c = buildRateLimitKey('login', '2001:db8:9999:0000::1');
    expect(a).not.toBe(c);
  });

  it('keeps IPv4 addresses distinct (per-address, as before)', () => {
    expect(buildRateLimitKey('login', '203.0.113.7')).not.toBe(
      buildRateLimitKey('login', '203.0.113.8')
    );
  });

  it('namespaces by limiter name so endpoints have separate buckets', () => {
    expect(buildRateLimitKey('login', '203.0.113.7')).not.toBe(
      buildRateLimitKey('register', '203.0.113.7')
    );
  });

  it('falls back to "unknown" without throwing when ip is missing', () => {
    expect(() => buildRateLimitKey('login', undefined)).not.toThrow();
    expect(buildRateLimitKey('login', undefined)).toContain('unknown');
  });
});
