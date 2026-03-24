import { test, expect } from '@playwright/test';
import { mockDashboardSession, MOCK_USER } from './helpers/api-mocks';

/**
 * E2E — Settings pages
 *
 * Covers:
 *  - Profile settings page renders with user data pre-filled
 *  - Name field is editable; email field is disabled
 *  - Save Changes submits PATCH /auth/profile and shows success toast
 *  - Security / change-password page renders the three password fields
 *  - Change password form validates mismatched passwords
 *  - Successful password change shows success toast
 */

const API = '**/api/v1';

test.describe('Profile settings page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardSession(page);
    await page.goto('/settings');
  });

  test('renders the Settings heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('profile card is visible with user name and email', async ({ page }) => {
    await expect(page.getByText(MOCK_USER.name)).toBeVisible();
    await expect(page.getByText(MOCK_USER.email)).toBeVisible();
  });

  test('Name input is pre-filled with current user name', async ({ page }) => {
    const nameInput = page.getByLabel('Name');
    await expect(nameInput).toHaveValue(MOCK_USER.name);
  });

  test('Email input is disabled (cannot be changed)', async ({ page }) => {
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toBeDisabled();
  });

  test('"Save Changes" button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
  });

  test('updating name and clicking Save Changes calls PATCH /auth/profile', async ({ page }) => {
    await page.route(`${API}/auth/profile`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'success',
            data: { user: { ...MOCK_USER, name: 'Updated Name' } },
          }),
        });
      } else {
        await route.continue();
      }
    });

    const nameInput = page.getByLabel('Name');
    await nameInput.clear();
    await nameInput.fill('Updated Name');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Toast success should appear
    await expect(page.getByText('Profile updated successfully')).toBeVisible({ timeout: 5000 });
  });

  test('shows error toast when profile update fails', async ({ page }) => {
    await page.route(`${API}/auth/profile`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'error', message: 'Internal server error' }),
        });
      } else {
        await route.continue();
      }
    });

    const nameInput = page.getByLabel('Name');
    await nameInput.clear();
    await nameInput.fill('Fail Case');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Failed to update profile')).toBeVisible({ timeout: 5000 });
  });

  test('has a link to Security settings', async ({ page }) => {
    await expect(page.getByRole('link', { name: /security/i })).toBeVisible();
  });
});

test.describe('Security (change password) settings page', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardSession(page);
    await page.goto('/settings/security');
  });

  test('renders the change password form', async ({ page }) => {
    await expect(page.getByLabel('Current Password')).toBeVisible();
    await expect(page.getByLabel('New Password', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm New Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /update password/i })).toBeVisible();
  });

  test('shows validation error when new passwords do not match', async ({ page }) => {
    await page.getByLabel('Current Password').fill('OldPass1!');
    await page.getByLabel('New Password', { exact: true }).fill('NewPass1!');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('DifferentPass1!');
    await page.getByRole('button', { name: /update password/i }).click();

    await expect(page.getByText("Passwords don't match")).toBeVisible();
  });

  test('successful password change shows success toast', async ({ page }) => {
    await page.route(`${API}/auth/change-password`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success' }),
      })
    );

    await page.getByLabel('Current Password').fill('OldPass1!');
    await page.getByLabel('New Password', { exact: true }).fill('NewPass1!');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('NewPass1!');
    await page.getByRole('button', { name: /update password/i }).click();

    await expect(page.getByText('Password changed successfully')).toBeVisible({ timeout: 5000 });
  });

  test('failed password change shows error toast', async ({ page }) => {
    await page.route(`${API}/auth/change-password`, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', message: 'Incorrect current password' }),
      })
    );

    await page.getByLabel('Current Password').fill('WrongPass1!');
    await page.getByLabel('New Password', { exact: true }).fill('NewPass1!');
    await page.getByLabel('Confirm New Password', { exact: true }).fill('NewPass1!');
    await page.getByRole('button', { name: /update password/i }).click();

    await expect(page.getByText(/Failed to change password/i)).toBeVisible({ timeout: 5000 });
  });
});
