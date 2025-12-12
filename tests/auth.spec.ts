import { test, expect, Page } from '@playwright/test';

/**
 * Authenticated User Tests
 * 
 * These tests verify functionality for logged-in users.
 * Requires TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables.
 * 
 * Run with: 
 * TEST_USER_EMAIL=test@example.com TEST_USER_PASSWORD=secret npx playwright test auth.spec.ts
 */

// Helper to login
async function login(page: Page, email: string, password: string) {
    await page.goto('/');
    await page.getByLabel('E-Mail').fill(email);
    await page.getByLabel('Passwort').fill(password);
    await page.getByRole('button', { name: 'Einloggen' }).click();

    // Wait for navigation away from login (look for sidebar or navigation)
    await page.waitForSelector('[class*="sidebar"], nav, .menu', { timeout: 15000 });
}

test.describe('Authenticated User Flow', () => {
    // Skip these tests if no credentials provided
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD,
        'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables');

    test.beforeEach(async ({ page }) => {
        const email = process.env.TEST_USER_EMAIL!;
        const password = process.env.TEST_USER_PASSWORD!;
        await login(page, email, password);
    });

    test('shows navigation after login', async ({ page }) => {
        // Should show some form of navigation (sidebar or bottom nav on mobile)
        const hasNav = await page.locator('nav, [class*="sidebar"], [class*="bottom"]').isVisible();
        expect(hasNav).toBeTruthy();
    });

    test('can navigate to time tracking', async ({ page }) => {
        // Click on Zeiterfassung link/button
        await page.getByText('Zeiterfassung').click();

        // Should show time tracking page
        await expect(page.getByText('Zeiterfassung')).toBeVisible();
    });
});

test.describe('Admin User Flow', () => {
    // Skip these tests if no admin credentials provided
    test.skip(!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD,
        'Requires TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD environment variables');

    test.beforeEach(async ({ page }) => {
        const email = process.env.TEST_ADMIN_EMAIL!;
        const password = process.env.TEST_ADMIN_PASSWORD!;
        await login(page, email, password);
    });

    test('shows admin dashboard', async ({ page }) => {
        // Admin should see dashboard
        await expect(page.getByText(/Dashboard|Admin/i)).toBeVisible();
    });
});
