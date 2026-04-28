import { test, expect } from '@playwright/test';
import {
  mockDashboardSession,
  mockAuthenticatedUser,
  mockNoWorkspaces,
  mockCreateAssessment,
  MOCK_WORKSPACE,
} from './helpers/api-mocks';

/**
 * E2E — Assessment creation flow
 *
 * Covers:
 *  - /assessments/new with no workspace shows "Select a workspace first"
 *  - Form renders with DORA framework selected by default
 *  - Framework toggle switches to CONTRACT_A30 and updates UI text
 *  - Vendor name field is pre-filled from workspace name
 *  - Assessment name is auto-generated from vendor + framework
 *  - Cannot submit without uploading a document (submit button stays disabled)
 *  - Successful creation with a file navigates to /assessments/:id
 */

test.describe('New Assessment page — no workspace', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedUser(page);
    await mockNoWorkspaces(page);
  });

  test('shows "Select a workspace first" when no active workspace', async ({ page }) => {
    await page.goto('/assessments/new');
    await expect(page.getByText('Select a workspace first')).toBeVisible();
  });
});

test.describe('New Assessment page — with workspace', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardSession(page);
    await page.goto('/assessments/new');
  });

  test('renders the assessment creation form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /New DORA Assessment/i })).toBeVisible();
    await expect(page.getByLabel('Vendor name')).toBeVisible();
    await expect(page.getByLabel('Assessment name')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Assessment' })).toBeVisible();
  });

  test('DORA framework is selected by default', async ({ page }) => {
    // "Gap Analysis (Art. 28/29)" button should have default (active) variant
    const doraBtn = page.getByRole('button', { name: /Gap Analysis/i });
    await expect(doraBtn).toBeVisible();
    // Heading should say "New DORA Assessment"
    await expect(page.getByRole('heading', { name: /New DORA Assessment/i })).toBeVisible();
  });

  test('clicking CONTRACT_A30 updates heading and description', async ({ page }) => {
    await page.getByRole('button', { name: /Contract Review \(Art\. 30\)/i }).click();
    await expect(page.getByRole('heading', { name: /New Contract Review/i })).toBeVisible();
    await expect(page.getByText(/Upload the ICT contract/i)).toBeVisible();
  });

  test('vendor name is pre-filled from active workspace', async ({ page }) => {
    const vendorInput = page.getByLabel('Vendor name');
    // Workspace name is "Acme Corp" — should be pre-filled
    await expect(vendorInput).toHaveValue(MOCK_WORKSPACE.name);
  });

  test('assessment name is auto-generated and contains vendor name', async ({ page }) => {
    const nameInput = page.getByLabel('Assessment name');
    const value = await nameInput.inputValue();
    expect(value).toContain('Acme Corp');
  });

  test('changing vendor name updates auto-generated assessment name', async ({ page }) => {
    const vendorInput = page.getByLabel('Vendor name');
    await vendorInput.clear();
    await vendorInput.fill('Beta Vendor');

    const nameInput = page.getByLabel('Assessment name');
    await expect(nameInput).toHaveValue(/Beta Vendor/);
  });

  test('Submit button is disabled when no file is uploaded', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: 'Start Assessment' });
    await expect(submitBtn).toBeDisabled();
  });

  test('Back button navigates to /assessments', async ({ page }) => {
    await page.getByRole('link', { name: 'Assessments' }).or(
      page.getByRole('button', { name: 'Assessments' })
    ).first().click();
    await expect(page).toHaveURL(/\/assessments$/);
  });
});

test.describe('New Assessment — successful creation with file', () => {
  test('uploads a file and submits, then navigates to assessment detail', async ({ page }) => {
    await mockDashboardSession(page);
    await mockCreateAssessment(page);

    await page.goto('/assessments/new');

    // Upload a mock PDF file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'vendor-policy.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('mock pdf content'),
    });

    // After uploading, the submit button should be enabled
    const submitBtn = page.getByRole('button', { name: 'Start Assessment' });
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });

    await submitBtn.click();

    // Should navigate to the new assessment detail page
    await expect(page).toHaveURL(/\/assessments\/assess-e2e-001/);
  });
});

test.describe('Assessments list page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardSession(page);
    await page.route('**/api/v1/assessments**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          data: {
            assessments: [
              {
                _id: 'assess-list-001',
                name: 'Q1 DORA Assessment',
                vendorName: 'Acme Corp',
                framework: 'DORA',
                status: 'complete',
                workspaceId: 'ws-e2e-001',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            pagination: { page: 1, limit: 20, total: 1, pages: 1 },
          },
        }),
      })
    );
  });

  test('displays the list of assessments', async ({ page }) => {
    await page.goto('/assessments');
    await expect(page.getByText('Q1 DORA Assessment')).toBeVisible();
  });

  test('has a "New Assessment" button', async ({ page }) => {
    await page.goto('/assessments');
    const newBtn = page.getByRole('link', { name: /New Assessment/i }).or(
      page.getByRole('button', { name: /New Assessment/i })
    ).first();
    await expect(newBtn).toBeVisible();
  });
});
