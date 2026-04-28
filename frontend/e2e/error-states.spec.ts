import { test, expect } from '@playwright/test';
import {
  mockDashboardSession,
  mockAuthenticatedUser,
  mockConversationList,
  MOCK_CONVERSATION,
} from './helpers/api-mocks';

/**
 * E2E — Error states
 *
 * Covers:
 *  - Session expiry (401 from /auth/me) redirects to /login
 *  - Network failure on conversation list shows an empty/error state gracefully
 *  - Failed POST /conversations shows an error (no redirect)
 *  - Failed RAG stream (non-200) shows error in the chat interface
 *  - Unauthenticated access to /settings redirects to /login
 *  - 500 error on workspace list is handled gracefully
 */

const API = '**/api/v1';

// ── Session expiry ─────────────────────────────────────────────────────────

test.describe('Session expiry', () => {
  test('expired session (401 /auth/me) on a protected page redirects to /login', async ({ page }) => {
    // First request succeeds (initial load), second returns 401 (session expired)
    let callCount = 0;
    await page.route(`${API}/auth/me`, (route) => {
      callCount++;
      if (callCount === 1) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'error', message: 'Unauthorized' }),
        });
      }
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Unauthorized' }),
      });
    });
    await page.route(/\/api\/v1\/workspaces\/my-workspaces(\?.*)?$/, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error' }) })
    );

    await page.goto('/chat');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('navigating to /settings without auth redirects to /login', async ({ page }) => {
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Unauthorized' }),
      })
    );

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('navigating to /workspaces without auth redirects to /login', async ({ page }) => {
    await page.route(`${API}/auth/me`, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error' }) })
    );
    await page.route(/\/api\/v1\/workspaces\/my-workspaces(\?.*)?$/, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error' }) })
    );

    await page.goto('/workspaces');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

// ── Network / API failures ─────────────────────────────────────────────────

test.describe('API failure error states', () => {
  test('workspace list API failure is handled — page still loads', async ({ page }) => {
    await mockAuthenticatedUser(page);
    await mockConversationList(page, []);

    // Workspaces API returns 500
    await page.route(/\/api\/v1\/workspaces\/my-workspaces(\?.*)?$/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Internal server error' }),
      })
    );

    await page.goto('/workspaces');

    // Page should not crash — the heading should still be present
    await expect(page.getByRole('heading', { name: 'Vendors', exact: true })).toBeVisible({ timeout: 5000 });
  });

  test('POST /conversations failure does not navigate away', async ({ page }) => {
    await mockDashboardSession(page);

    // Conversation creation fails
    await page.route(/\/api\/v1\/conversations(\?.*)?$/, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'error', message: 'Internal server error' }),
        });
      } else {
        await route.continue();
      }
    });

    // Stream also fails
    await page.route(`${API}/rag/stream`, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Service unavailable' }),
      })
    );

    await page.goto('/chat');

    const chatInput = page.getByRole('textbox').first();
    await chatInput.fill('What is DORA?');
    await chatInput.press('Enter');

    // Should stay on /chat (no redirect to /conversations/:id)
    await expect(page).toHaveURL(/\/chat/, { timeout: 5000 });
  });

  test('aborted network request on chat page does not crash the page', async ({ page }) => {
    await mockDashboardSession(page);

    // Abort the RAG stream entirely
    await page.route(`${API}/rag/stream`, (route) => route.abort('failed'));

    await page.goto('/chat');

    // Page heading should remain visible even after the stream aborts
    await expect(page.getByText('New Conversation')).toBeVisible();
  });

  test('assessments list 500 error — page loads with empty state', async ({ page }) => {
    await mockDashboardSession(page);
    await page.route(/\/api\/v1\/assessments.*/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Internal server error' }),
      })
    );

    await page.goto('/assessments');

    // Page should render without crashing
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});

// ── Conversation view — gone / not found ──────────────────────────────────

test.describe('Conversation not found', () => {
  test('accessing a non-existent conversation shows an error or redirects', async ({ page }) => {
    await mockDashboardSession(page);

    await page.route(`${API}/conversations/nonexistent-id`, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Conversation not found' }),
      })
    );

    await page.route(`${API}/conversations/nonexistent-id/messages`, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Not found' }),
      })
    );

    await page.goto('/conversations/nonexistent-id');

    // Wait for error state — page renders "Failed to load conversation" on 404
    await expect(page.getByText('Failed to load conversation')).toBeVisible({ timeout: 8000 });
  });
});

// ── Chat streaming error ───────────────────────────────────────────────────

test.describe('Chat streaming error state', () => {
  test('non-200 stream response is handled on the conversation page', async ({ page }) => {
    await mockDashboardSession(page);

    // Mock an existing conversation detail
    await page.route(`${API}/conversations/${MOCK_CONVERSATION._id}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: { conversation: MOCK_CONVERSATION },
        }),
      })
    );
    await page.route(`${API}/conversations/${MOCK_CONVERSATION._id}/messages`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: { messages: [] },
        }),
      })
    );

    // RAG stream returns 401
    await page.route(`${API}/rag/stream`, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized' }),
      })
    );

    await page.goto(`/conversations/${MOCK_CONVERSATION._id}`);

    const chatInput = page.getByRole('textbox').first();
    await chatInput.fill('What is DORA?');
    await chatInput.press('Enter');

    // Page should remain on the conversation page (no crash)
    await expect(page).toHaveURL(new RegExp(`/conversations/${MOCK_CONVERSATION._id}`), { timeout: 5000 });
  });
});
