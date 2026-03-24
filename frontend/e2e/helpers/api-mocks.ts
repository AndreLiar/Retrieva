import type { Page } from '@playwright/test';

/**
 * Shared API mock helpers for E2E tests.
 *
 * Uses Playwright's page.route() to intercept backend calls.
 * No real backend is required — all responses are stubbed.
 */

const API = '**/api/v1';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

export const MOCK_USER = {
  _id: 'user-e2e-001',
  name: 'E2E Tester',
  email: 'e2e@retrieva.online',
  role: 'admin',
  emailVerified: true,
  onboarding: { completed: true, checklist: {} },
};

export const MOCK_WORKSPACE = {
  _id: 'ws-e2e-001',
  name: 'Acme Corp',
  description: 'E2E test workspace',
  role: 'owner',
  permissions: { canEdit: true, canDelete: true, canInvite: true },
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
// Auth mocks
// ---------------------------------------------------------------------------

/** Mock a successful GET /auth/me (user is logged in) */
export async function mockAuthenticatedUser(page: Page, user = MOCK_USER) {
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

/** Mock a successful POST /auth/login */
export async function mockLoginSuccess(page: Page, user = MOCK_USER) {
  await page.route(`${API}/auth/login`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        data: { user, accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
      }),
    })
  );
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

/** Mock a successful POST /auth/register */
export async function mockRegisterSuccess(page: Page, user = MOCK_USER) {
  await page.route(`${API}/auth/register`, (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        data: { user, accessToken: 'mock-token', needsOrganization: false },
      }),
    })
  );
}

// ---------------------------------------------------------------------------
// Workspace mocks
// ---------------------------------------------------------------------------

/** Mock GET /workspaces/my-workspaces */
export async function mockWorkspaceList(page: Page, workspaces = [MOCK_WORKSPACE]) {
  await page.route(`${API}/workspaces/my-workspaces`, (route) =>
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

/** Mock GET /conversations */
export async function mockConversationList(page: Page, conversations = [MOCK_CONVERSATION]) {
  await page.route(`${API}/conversations`, async (route) => {
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
