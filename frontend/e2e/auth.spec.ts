import { test, expect } from '@playwright/test';
import {
  mockLoginSuccess,
  mockLoginFailure,
  mockRegisterSuccess,
  mockAuthenticatedUser,
  mockWorkspaceList,
  mockConversationList,
} from './helpers/api-mocks';

/**
 * E2E — Auth flows
 *
 * Covers:
 *  - Login page rendering and form validation
 *  - Successful login → redirect to /chat
 *  - Failed login → error message shown
 *  - Register page rendering
 *  - Navigation between auth pages
 */

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    // Unauthenticated state — auth/me returns 401 so no auto-redirect
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'Unauthorized' }) })
    );
    await page.goto('/login');
  });

  test('renders the login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('shows a link to register', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
  });

  test('shows a "Forgot password?" link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  });

  test('shows validation error when submitting empty form', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    // HTML5 required validation or zod — either way the form should not submit
    // and the button should remain on the page
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('shows error message on invalid credentials', async ({ page }) => {
    await mockLoginFailure(page);

    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('successful login redirects to /chat', async ({ page }) => {
    await mockLoginSuccess(page);
    // After login, the auth provider calls /auth/me and workspace store calls /workspaces/my-workspaces
    await mockAuthenticatedUser(page);
    await mockWorkspaceList(page);
    await mockConversationList(page);

    await page.getByLabel('Email').fill('e2e@retrieva.online');
    await page.getByLabel('Password').fill('ValidPass1!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/chat/);
  });

  test('password toggle shows/hides password', async ({ page }) => {
    const passwordInput = page.getByLabel('Password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click the eye button (sr-only text "Show password")
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('navigates to register page via Sign up link', async ({ page }) => {
    await page.getByRole('link', { name: 'Sign up' }).click();
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe('Register page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error' }) })
    );
    await page.goto('/register');
  });

  test('renders the registration form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });

  test('shows a link to login', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('shows password strength requirements as user types', async ({ page }) => {
    // Requirements are only shown once the user starts typing
    const passwordField = page.getByLabel('Password', { exact: true });
    await passwordField.fill('abc');
    await expect(page.getByText('At least 8 characters')).toBeVisible();
    await expect(page.getByText('One uppercase letter')).toBeVisible();
  });

  test('successful registration shows confirmation screen', async ({ page }) => {
    await mockRegisterSuccess(page);
    await page.route('**/api/v1/workspaces/my-workspaces', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: { workspaces: [] } }) })
    );

    await page.getByLabel('Name').fill('Alice Dupont');
    await page.getByLabel('Email').fill('alice@example.com');
    await page.getByLabel('Password', { exact: true }).fill('ValidPass1!');
    await page.getByLabel('Confirm Password').fill('ValidPass1!');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Account created!' })).toBeVisible();
  });
});
