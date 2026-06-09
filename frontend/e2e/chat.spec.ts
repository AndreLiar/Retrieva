import { test, expect } from '@playwright/test';
import {
  mockDashboardSession,
  mockAuthenticatedUser,
  mockNoWorkspaces,
  mockConversationList,
  MOCK_CONVERSATION,
} from './helpers/api-mocks';

/**
 * E2E — Chat / RAG query flow
 *
 * Covers:
 *  - Unauthenticated users are redirected to /login
 *  - /chat with no workspace shows "Select a workspace" message
 *  - /chat with active workspace shows the chat interface
 *  - Sending a message creates a conversation and redirects to /conversations/:id
 */

test.describe('Chat page — unauthenticated', () => {
  test('redirects to /login when not authenticated', async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error' }) })
    );
    await page.route('**/api/v1/workspaces/my-workspaces', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error' }) })
    );

    await page.goto('/chat');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Chat page — no workspace', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
    await mockNoWorkspaces(page);
    await mockConversationList(page, []);
  });

  test('shows "Select a workspace" prompt when no workspace is active', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByText('Select a workspace to start a conversation')).toBeVisible();
  });
});

test.describe('Chat page — with workspace', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardSession(page);
  });

  test('shows New Conversation heading when a workspace is active', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByText('New Conversation')).toBeVisible();
  });

  test('chat input area is present', async ({ page }) => {
    await page.goto('/chat');
    // The chat interface should render a textarea or input for sending messages
    const chatInput = page.getByRole('textbox');
    await expect(chatInput.first()).toBeVisible();
  });

  test('creating a conversation navigates to /conversations/:id', async ({ page }) => {
    // Mock the POST /conversations call
    await page.route('**/api/v1/conversations', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', data: { conversation: MOCK_CONVERSATION } }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock the streaming endpoint (POST /rag/stream) to return an empty stream
    await page.route('**/api/v1/rag/stream', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"done"}\n\n',
      })
    );

    await page.goto('/chat');

    const chatInput = page.getByRole('textbox').first();
    await chatInput.fill('What are the DORA requirements?');
    await chatInput.press('Enter');

    // After conversation creation, should redirect to /conversations/<id>
    await expect(page).toHaveURL(/\/conversations\//);
  });

  test('sends the first message after creating the conversation (#397)', async ({ page }) => {
    await page.route('**/api/v1/conversations', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', data: { conversation: MOCK_CONVERSATION } }),
        });
      } else {
        await route.continue();
      }
    });

    // The destination conversation page loads the (empty) new conversation.
    await page.route(`**/api/v1/conversations/${MOCK_CONVERSATION.id}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: { conversation: MOCK_CONVERSATION, messages: [] },
        }),
      })
    );

    // Capture the question + the page that fired the stream request.
    let streamedBody: string | null = null;
    let streamedFromUrl: string | null = null;
    await page.route('**/api/v1/rag/stream', async (route) => {
      streamedBody = route.request().postData();
      streamedFromUrl = route.request().frame().url();
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"done"}\n\n',
      });
    });

    await page.goto('/chat');
    const chatInput = page.getByRole('textbox').first();
    await chatInput.fill('What are the DORA requirements?');
    await chatInput.press('Enter');

    await expect(page).toHaveURL(/\/conversations\//);
    // The bug (#397): the first message was sent from the blank /chat page, which
    // then unmounted on navigation and aborted the stream — so it was lost. With
    // the fix the message is sent from the mounted /conversations/<id> page.
    await expect.poll(() => streamedBody).toContain('DORA requirements');
    await expect.poll(() => streamedFromUrl).toContain('/conversations/');
  });
});

test.describe('Conversations list page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardSession(page);
  });

  test('displays existing conversations', async ({ page }) => {
    await page.goto('/conversations');
    await expect(page.getByText('E2E Test Conversation')).toBeVisible();
  });
});
