import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public paths that don't require authentication
// Note: We use exact match for '/' to avoid matching all routes
const publicPaths = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/q', // public vendor questionnaire form (no auth required)
];

// Admin-only paths
const adminPaths = ['/admin'];

/**
 * Decode JWT payload without verification (verification happens on backend)
 * This is just for route protection heuristics
 */
function decodeJWTPayload(token: string): { role?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get tokens from cookies. The access token cookie lives 15 min; the refresh
  // token cookie lives 7 days. A present refresh token means the client can
  // silently mint a new access token — so an expired access token must NOT bounce
  // the user to login.
  const accessToken = request.cookies.get('accessToken')?.value;
  const refreshToken = request.cookies.get('refreshToken')?.value;

  // Check if path is public (exact match for '/', startsWith for others)
  const isPublicPath = pathname === '/' || publicPaths.some((path) => pathname.startsWith(path));

  // Check if path is admin-only
  const isAdminPath = adminPaths.some((path) => pathname.startsWith(path));

  // Auth-only public paths (redirect authenticated users away from these)
  const authOnlyPaths = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];
  const isAuthOnlyPath = authOnlyPaths.some((path) => pathname.startsWith(path));

  // If on auth page (login, register, etc.) and user is authenticated, redirect to chat
  if (isAuthOnlyPath && accessToken) {
    const payload = decodeJWTPayload(accessToken);
    // Only redirect if token is not expired
    if (payload?.exp && payload.exp * 1000 > Date.now()) {
      return NextResponse.redirect(new URL('/chat', request.url));
    }
  }

  // If protected path and the user has NO way to authenticate (neither a valid
  // access token nor a refresh token), redirect to login. When only the access
  // token is gone but a refresh token survives, let the request through — the
  // client's AuthProvider / axios interceptor will refresh transparently.
  if (!isPublicPath && !accessToken && !refreshToken) {
    const loginUrl = new URL('/login', request.url);
    // Store the original URL to redirect back after login
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If admin path, check if user has admin role
  if (isAdminPath && accessToken) {
    const payload = decodeJWTPayload(accessToken);
    if (payload?.role !== 'admin') {
      // Redirect non-admins to home page
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|_next).*)',
  ],
};
