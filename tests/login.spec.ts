import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Dienstplan-App Login
 * 
 * These tests verify the login flow works correctly.
 * Run with: npx playwright test tests/login.spec.ts
 */

test.describe('Login Flow', () => {
    test('shows login page when not authenticated', async ({ page }) => {
        await page.goto('/');

        // Should show login form with heading "WoBePlaner"
        await expect(page.getByRole('heading', { name: 'WoBePlaner' })).toBeVisible();

        // Should have email and password input fields
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test('shows error on invalid login', async ({ page }) => {
        await page.goto('/');

        // Fill in invalid credentials using type selectors
        await page.locator('input[type="email"]').fill('invalid@test.com');
        await page.locator('input[type="password"]').fill('wrongpassword');

        // Click login button
        await page.getByRole('button', { name: 'Einloggen' }).click();

        // Should show error message (wait for network)
        // The error message container should appear with red styling
        await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 10000 });
    });

    test('shows login form elements', async ({ page }) => {
        await page.goto('/');

        // Check all form elements
        await expect(page.getByRole('button', { name: 'Einloggen' })).toBeVisible();
        await expect(page.getByText('Passwort vergessen?')).toBeVisible();
    });

    test('can switch to magic link mode', async ({ page }) => {
        await page.goto('/');

        // Click on "Passwort vergessen?"
        await page.getByText('Passwort vergessen? Login per E-Mail Link').click();

        // Should show different heading and button
        await expect(page.getByRole('heading', { name: 'Login per Link' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Link anfordern' })).toBeVisible();

        // Password field should be hidden in magic link mode
        await expect(page.locator('input[type="password"]')).not.toBeVisible();
    });
});

test.describe('Accessibility', () => {
    test('login form inputs have correct types', async ({ page }) => {
        await page.goto('/');

        // Check that inputs exist with correct types
        const emailInput = page.locator('input[type="email"]');
        const passwordInput = page.locator('input[type="password"]');

        await expect(emailInput).toBeVisible();
        await expect(passwordInput).toBeVisible();

        // Check they are required
        await expect(emailInput).toHaveAttribute('required', '');
        await expect(passwordInput).toHaveAttribute('required', '');
    });
});

test.describe('Visual', () => {
    test('logo is displayed', async ({ page }) => {
        await page.goto('/');

        // Check logo is visible
        await expect(page.locator('img[alt="Logo"]')).toBeVisible();
    });
});
