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

  // Get access token from cookie
  const accessToken = request.cookies.get('accessToken')?.value;

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

  // If protected path and user is not authenticated, redirect to login
  if (!isPublicPath && !accessToken) {
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
