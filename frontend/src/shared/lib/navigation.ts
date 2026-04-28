interface RouterLike {
  push: (href: string) => void;
  replace: (href: string) => void;
}

export const LOGIN_ROUTE = '/login';
export const APP_HOME_ROUTE = '/chat';
export const MARKETING_HOME_ROUTE = '/';
export const ONBOARDING_ROUTE = '/onboarding';

export const PUBLIC_AUTH_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

export function isPublicAuthPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_AUTH_PATHS.some((path) => pathname.startsWith(path));
}

export function pushRoute(router: RouterLike, href: string) {
  router.push(href);
}

export function replaceRoute(router: RouterLike, href: string) {
  router.replace(href);
}

export function navigateWindowTo(href: string) {
  if (typeof window !== 'undefined') {
    if (typeof window.location.assign === 'function') {
      window.location.assign(href);
      return;
    }

    window.location.href = href;
  }
}

export function redirectToLogin(router?: RouterLike) {
  if (router) {
    replaceRoute(router, LOGIN_ROUTE);
    return;
  }

  navigateWindowTo(LOGIN_ROUTE);
}
