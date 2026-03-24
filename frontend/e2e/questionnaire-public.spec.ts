import { test, expect } from '@playwright/test';

/**
 * E2E — Public vendor questionnaire form (/q/:token)
 *
 * This page is unauthenticated — external vendors land here from an email link.
 *
 * Covers:
 *  - Form loads and shows vendor name + first category questions
 *  - Textarea answers are editable
 *  - "Save & Continue" posts partial answers and advances to next step
 *  - "Submit Questionnaire" on last step posts final=true and shows success
 *  - Expired token (410) shows "Link Expired" state
 *  - Not-found token (404) shows error state
 *  - Already-complete token shows "Response Already Received"
 *  - Back button returns to previous step
 */

// Regex intercepts work regardless of whether publicClient prepends /api/v1 twice
const RESPOND_ROUTE = /\/questionnaires\/respond\//;

const TOKEN = 'test-token-valid';
const TOKEN_EXPIRED = 'test-token-expired';
const TOKEN_404 = 'test-token-notfound';
const TOKEN_DONE = 'test-token-complete';

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_QUESTIONS_CAT1 = [
  {
    id: 'q1',
    text: 'Describe your ICT governance framework.',
    doraArticle: 'Art.5',
    category: 'ICT Governance',
    hint: 'Include board-level accountability details.',
  },
  {
    id: 'q2',
    text: 'Who is the designated ICT risk owner?',
    doraArticle: 'Art.5',
    category: 'ICT Governance',
  },
];

const MOCK_QUESTIONS_CAT2 = [
  {
    id: 'q3',
    text: 'Describe your patch management process.',
    doraArticle: 'Art.9',
    category: 'Security Controls',
  },
];

const ALL_QUESTIONS = [...MOCK_QUESTIONS_CAT1, ...MOCK_QUESTIONS_CAT2];

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Questionnaire public form — happy path', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(RESPOND_ROUTE, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            data: {
              vendorName: 'Acme Corp',
              status: 'sent',
              questions: ALL_QUESTIONS,
              alreadyComplete: false,
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            data: { saved: true, final: false },
          }),
        });
      }
    });

    await page.goto(`/q/${TOKEN}`);
  });

  test('shows vendor name and first category heading', async ({ page }) => {
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Step 1 of 2 — ICT Governance/)).toBeVisible();
  });

  test('renders questions for the first category', async ({ page }) => {
    await expect(page.getByText('Describe your ICT governance framework.')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Who is the designated ICT risk owner?')).toBeVisible();
  });

  test('shows DORA article badge on each question', async ({ page }) => {
    await expect(page.getByText('Art.5').first()).toBeVisible({ timeout: 5000 });
  });

  test('hint text is shown when present', async ({ page }) => {
    await expect(page.getByText('Include board-level accountability details.')).toBeVisible({ timeout: 5000 });
  });

  test('textarea is editable', async ({ page }) => {
    await page.waitForSelector('textarea', { timeout: 5000 });
    const textarea = page.locator('textarea').first();
    await textarea.fill('We have a dedicated ICT risk committee.');
    await expect(textarea).toHaveValue('We have a dedicated ICT risk committee.');
  });

  test('"Save & Continue" posts partial answers and advances to next category', async ({ page }) => {
    await page.waitForSelector('textarea', { timeout: 5000 });
    await page.locator('textarea').first().fill('Governance answer');

    let postedBody: string | null = null;
    await page.route(RESPOND_ROUTE, async (route) => {
      if (route.request().method() === 'POST') {
        postedBody = route.request().postData();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', data: { saved: true, final: false } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole('button', { name: /save.*continue/i }).click();

    // Advances to step 2 — Security Controls
    await expect(page.getByText('Security Controls')).toBeVisible({ timeout: 5000 });

    // Posted with final: false
    expect(postedBody).not.toBeNull();
    const body = JSON.parse(postedBody!);
    expect(body.final).toBe(false);
  });

  test('"Back" button returns to the previous step', async ({ page }) => {
    await page.waitForSelector('textarea', { timeout: 5000 });

    // Advance to step 2
    await page.route(RESPOND_ROUTE, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', data: { saved: true, final: false } }),
        });
      } else {
        await route.continue();
      }
    });
    await page.getByRole('button', { name: /save.*continue/i }).click();
    await expect(page.getByText('Security Controls')).toBeVisible({ timeout: 5000 });

    // Go back
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText(/Step 1 of 2 — ICT Governance/)).toBeVisible();
  });

  test('"Submit Questionnaire" on last step posts final=true and shows success', async ({ page }) => {
    await page.waitForSelector('textarea', { timeout: 5000 });

    // Navigate to last step (step 2 of 2)
    await page.route(RESPOND_ROUTE, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', data: { saved: true, final: route.request().postData()?.includes('"final":true') } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole('button', { name: /save.*continue/i }).click();
    await expect(page.getByText('Security Controls')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /submit questionnaire/i }).click();

    // Success state
    await expect(page.getByText('Thank you!')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/submitted successfully/i)).toBeVisible();
  });

  test('progress bar advances between steps', async ({ page }) => {
    await page.waitForSelector('textarea', { timeout: 5000 });
    // Step 1 of 2 = 50%
    await expect(page.getByText('50% complete')).toBeVisible();

    await page.route(RESPOND_ROUTE, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', data: { saved: true, final: false } }),
        });
      } else {
        await route.continue();
      }
    });
    await page.getByRole('button', { name: /save.*continue/i }).click();

    // Step 2 of 2 = 100%
    await expect(page.getByText('100% complete')).toBeVisible({ timeout: 5000 });
  });
});

// ── Error states ───────────────────────────────────────────────────────────

test.describe('Questionnaire public form — error states', () => {
  test('expired token (410) shows "Link Expired"', async ({ page }) => {
    await page.route(RESPOND_ROUTE, (route) =>
      route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Link expired' }),
      })
    );

    await page.goto(`/q/${TOKEN_EXPIRED}`);

    await expect(page.getByText('Link Expired')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/request a new link/i)).toBeVisible();
  });

  test('not-found token (404) shows error message', async ({ page }) => {
    await page.route(RESPOND_ROUTE, (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Not found' }),
      })
    );

    await page.goto(`/q/${TOKEN_404}`);

    await expect(page.getByText('Questionnaire not found.')).toBeVisible({ timeout: 5000 });
  });

  test('already-complete token shows "Response Already Received"', async ({ page }) => {
    await page.route(RESPOND_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: { alreadyComplete: true, vendorName: 'Acme Corp', questions: [] },
        }),
      })
    );

    await page.goto(`/q/${TOKEN_DONE}`);

    await expect(page.getByText('Response Already Received')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/already been received/i)).toBeVisible();
  });

  test('server error (500) shows generic error message', async ({ page }) => {
    await page.route(RESPOND_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Server error' }),
      })
    );

    await page.goto(`/q/test-token-500`);

    await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/unable to load questionnaire/i)).toBeVisible();
  });
});

// ── Layout ─────────────────────────────────────────────────────────────────

test.describe('Questionnaire public form — layout', () => {
  test('shows Retrieva branding in the header (no dashboard sidebar)', async ({ page }) => {
    await page.route(RESPOND_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: { vendorName: 'Acme Corp', status: 'sent', questions: ALL_QUESTIONS, alreadyComplete: false },
        }),
      })
    );

    await page.goto(`/q/${TOKEN}`);

    await expect(page.getByText('Retrieva').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Third-Party Risk')).toBeVisible();
    // No dashboard sidebar
    await expect(page.locator('nav').first()).not.toBeVisible();
  });
});
