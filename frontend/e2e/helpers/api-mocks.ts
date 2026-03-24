import type { Page } from '@playwright/test';

/**
 * Shared API mock helpers for E2E tests.
 *
 * Uses Playwright's page.route() to intercept backend calls.
 * No real backend is required — all responses are stubbed.
 */

const API = '**/api/v1';

// Mock access token — any non-empty string satisfies the middleware cookie check.
// The middleware (src/proxy.ts) only checks cookie existence for route protection.
const MOCK_ACCESS_TOKEN = 'mock-e2e-access-token';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

export const MOCK_USER = {
  id: 'user-e2e-001',
  name: 'E2E Tester',
  email: 'e2e@retrieva.online',
  role: 'admin' as const,
  isEmailVerified: true,
  organizationId: 'org-e2e-001',
  onboardingCompleted: true,
};

export const MOCK_WORKSPACE = {
  id: 'ws-e2e-001',
  name: 'Acme Corp',
  description: 'E2E test workspace',
  role: 'owner' as const,
  permissions: { canQuery: true, canViewSources: true, canInvite: true },
};

export const MOCK_CONVERSATION = {
  _id: 'conv-e2e-001',
  id: 'conv-e2e-001',
  title: 'E2E Test Conversation',
  workspaceId: 'ws-e2e-001',
  isPinned: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Set the accessToken cookie in the browser context.
 * Required so the Next.js middleware (src/proxy.ts) allows access to
 * protected routes without redirecting to /login.
 */
export async function setAuthCookie(page: Page) {
  await page.context().addCookies([
    {
      name: 'accessToken',
      value: MOCK_ACCESS_TOKEN,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

// ---------------------------------------------------------------------------
// Auth mocks
// ---------------------------------------------------------------------------

/** Mock a successful GET /auth/me (user is logged in) and pre-set the auth cookie */
export async function mockAuthenticatedUser(page: Page, user = MOCK_USER) {
  // Set the cookie so the middleware allows protected routes
  await setAuthCookie(page);

  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: { user } }),
    })
  );
}

/** Mock GET /auth/me returning 401 (user is not logged in) */
export async function mockUnauthenticated(page: Page) {
  await page.route(`${API}/auth/me`, (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', message: 'Unauthorized' }),
    })
  );
}

/** Mock a successful POST /auth/login — also sets the auth cookie when the route fires */
export async function mockLoginSuccess(page: Page, user = MOCK_USER) {
  await page.route(`${API}/auth/login`, async (route) => {
    // Set cookie so subsequent navigation to protected pages passes middleware
    await setAuthCookie(page);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        data: { user, accessToken: MOCK_ACCESS_TOKEN, refreshToken: 'mock-refresh-token' },
      }),
    });
  });
}

/** Mock a failed POST /auth/login (invalid credentials) */
export async function mockLoginFailure(page: Page, message = 'Invalid email or password') {
  await page.route(`${API}/auth/login`, (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'error', message }),
    })
  );
}

/** Mock a successful POST /auth/register — also sets the auth cookie when the route fires */
export async function mockRegisterSuccess(page: Page, user = MOCK_USER) {
  await page.route(`${API}/auth/register`, async (route) => {
    await setAuthCookie(page);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        data: { user, accessToken: MOCK_ACCESS_TOKEN, needsOrganization: false },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Workspace mocks
// ---------------------------------------------------------------------------

/** Mock GET /workspaces/my-workspaces (with or without query params) */
export async function mockWorkspaceList(page: Page, workspaces = [MOCK_WORKSPACE]) {
  await page.route(/\/api\/v1\/workspaces\/my-workspaces(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'success', data: { workspaces } }),
    })
  );
}

/** Mock GET /workspaces/my-workspaces returning empty list */
export async function mockNoWorkspaces(page: Page) {
  await mockWorkspaceList(page, []);
}

// ---------------------------------------------------------------------------
// Conversation mocks
// ---------------------------------------------------------------------------

/** Mock GET /conversations (with or without query params) and POST /conversations */
export async function mockConversationList(page: Page, conversations = [MOCK_CONVERSATION]) {
  // Regex matches /api/v1/conversations with optional query params, not /conversations/:id
  await page.route(/\/api\/v1\/conversations(\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: {
            conversations,
            pagination: { total: conversations.length, limit: 20, skip: 0, hasMore: false },
          },
        }),
      });
    } else {
      // POST /conversations — create
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', data: { conversation: MOCK_CONVERSATION } }),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Assessment mocks
// ---------------------------------------------------------------------------

/** Mock POST /assessments (create assessment) */
export async function mockCreateAssessment(page: Page) {
  await page.route(`${API}/assessments`, (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        data: {
          assessment: {
            _id: 'assess-e2e-001',
            name: 'E2E DORA Assessment',
            vendorName: 'Acme Corp',
            framework: 'DORA',
            status: 'pending',
            workspaceId: 'ws-e2e-001',
          },
        },
      }),
    })
  );
}

// ---------------------------------------------------------------------------
// Composite: mock all calls needed for an authenticated dashboard session
// ---------------------------------------------------------------------------

export async function mockDashboardSession(page: Page) {
  await mockAuthenticatedUser(page);
  await mockWorkspaceList(page);
  await mockConversationList(page);
}
