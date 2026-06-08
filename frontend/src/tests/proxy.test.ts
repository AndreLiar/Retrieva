import { describe, it, expect } from 'vitest';
import { proxy } from '@/proxy';
import type { NextRequest } from 'next/server';

/**
 * Minimal NextRequest stand-in: proxy() only reads `nextUrl.pathname`,
 * `url`, and `cookies.get(name)?.value`.
 */
function makeReq(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  return {
    nextUrl: { pathname },
    url: `https://app.test${pathname}`,
    cookies: {
      get: (name: string) =>
        cookies[name] !== undefined ? { value: cookies[name] } : undefined,
    },
  } as unknown as NextRequest;
}

const location = (res: Response) => res.headers.get('location');

describe('proxy middleware — refresh-aware route guard', () => {
  it('redirects to login on a protected path with no tokens', () => {
    const res = proxy(makeReq('/chat'));
    expect(location(res)).toContain('/login');
    expect(location(res)).toContain('callbackUrl=%2Fchat');
  });

  it('allows a protected path when only a refresh token survives (access expired)', () => {
    // This is the core fix: a missing access token must NOT bounce the user to
    // login while a 7-day refresh token is still present.
    const res = proxy(makeReq('/chat', { refreshToken: 'r' }));
    expect(location(res)).toBeNull();
  });

  it('allows a protected path with an access token', () => {
    const res = proxy(makeReq('/chat', { accessToken: 'a' }));
    expect(location(res)).toBeNull();
  });

  it('allows public paths without any token', () => {
    expect(location(proxy(makeReq('/login')))).toBeNull();
    expect(location(proxy(makeReq('/')))).toBeNull();
  });
});
