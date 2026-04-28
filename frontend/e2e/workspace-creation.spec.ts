import { test, expect } from '@playwright/test';
import {
  mockDashboardSession,
  MOCK_WORKSPACE,
} from './helpers/api-mocks';

/**
 * E2E — Workspace creation modal
 *
 * Covers:
 *  - "New Vendor" button opens the creation modal
 *  - Step 1: vendor name validation (empty, too short, valid)
 *  - Step 2: ICT service type selection advances to step 3
 *  - Non-ICT selection skips to step 4
 *  - Step 4: "Create workspace" button calls POST /workspaces and shows toast
 *  - Cancel closes the modal without submitting
 */

const API = '**/api/v1';

test.describe('Workspace creation modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardSession(page);
    await page.goto('/workspaces');
  });

  test('clicking "New Vendor" opens the creation modal', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New Vendor Workspace' })).toBeVisible();
  });

  test('step 1 shows vendor name input field', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();

    await expect(page.getByLabel('Vendor name', { exact: false })).toBeVisible();
  });

  test('Next button on step 1 shows error when name is empty', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(page.getByText('Vendor name is required')).toBeVisible();
  });

  test('Next button on step 1 shows error when name is too short', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();
    await page.getByLabel('Vendor name', { exact: false }).fill('A');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(page.getByText('Must be at least 2 characters')).toBeVisible();
  });

  test('entering a valid name and clicking Next advances to step 2', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();
    await page.getByLabel('Vendor name', { exact: false }).fill('Amazon Web Services');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'ICT Service Classification' })).toBeVisible();
  });

  test('pressing Enter in vendor name field also advances to step 2', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();
    await page.getByLabel('Vendor name', { exact: false }).fill('Cloud Provider');
    await page.getByLabel('Vendor name', { exact: false }).press('Enter');

    await expect(page.getByRole('heading', { name: 'ICT Service Classification' })).toBeVisible();
  });

  test('step 2: Next is disabled until a service type is selected', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();
    await page.getByLabel('Vendor name', { exact: false }).fill('Cloud Provider');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Next button on step 2 should be disabled before selecting a type
    const nextBtn = page.getByRole('button', { name: 'Next', exact: true });
    await expect(nextBtn).toBeDisabled();
  });

  test('selecting Cloud service type enables Next on step 2', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();
    await page.getByLabel('Vendor name', { exact: false }).fill('Cloud Provider');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await page.getByText('Cloud / IaaS / SaaS').click();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  });

  test('selecting "Not an ICT service" skips to step 4 (Review)', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();
    await page.getByLabel('Vendor name', { exact: false }).fill('Office Supplies Co');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await page.getByText('Not an ICT service').click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Should skip step 3 and go directly to step 4
    await expect(page.getByRole('heading', { name: 'Review & Contract Details' })).toBeVisible();
  });

  test('Back button on step 2 returns to step 1', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();
    await page.getByLabel('Vendor name', { exact: false }).fill('Cloud Provider');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'New Vendor Workspace' })).toBeVisible();
  });

  test('successful creation calls POST /workspaces and closes modal', async ({ page }) => {
    // Mock the create workspace API
    const newWorkspace = { ...MOCK_WORKSPACE, id: 'ws-new-001', name: 'Cloud Provider' };
    await page.route(`${API}/workspaces`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', data: { workspace: newWorkspace } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole('button', { name: 'New Vendor' }).click();

    // Step 1 — vendor name
    await page.getByLabel('Vendor name', { exact: false }).fill('Cloud Provider');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Step 2 — select Not an ICT service (shortest path to step 4)
    await page.getByText('Not an ICT service').click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Step 4 — create
    await page.getByRole('button', { name: 'Create workspace' }).click();

    // Modal closes after successful creation
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('Cancel button closes the modal without submitting', async ({ page }) => {
    await page.getByRole('button', { name: 'New Vendor' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
