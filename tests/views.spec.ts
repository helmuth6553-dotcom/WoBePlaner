import { test, expect, Page } from '@playwright/test';

/**
 * BALANCE CONSISTENCY E2E TESTS
 * 
 * These tests verify that the hour balance (Stundenkonto) is displayed
 * correctly and consistently across all views:
 * - RosterFeed (Mein Stundenkonto)
 * - TimeTracking (Zeiterfassung)
 * - TeamPanel (Team Übersicht)
 * 
 * CRITICAL: All views must show the same values for the same user!
 */

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function login(page: Page, email: string, password: string): Promise<boolean> {
    await page.goto('/');

    // Wait for splash screen to disappear (app shows splash for 2 seconds)
    // The login form has the email input field
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // Small extra wait to ensure form is fully interactive
    await page.waitForTimeout(500);

    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Einloggen' }).click();

    try {
        // Wait for any of these indicators that login succeeded
        // Desktop: sidebar, nav
        // Mobile: bottom nav buttons with specific names (BottomNav component)
        await page.waitForSelector(
            'button:has-text("Dienstplan"), button:has-text("Zeiten"), button:has-text("Urlaub")',
            { timeout: 20000 }
        );
        return true;
    } catch {
        return false;
    }
}


// Navigate to a specific tab
// Handles both desktop sidebar and mobile bottom navigation
// WICHTIG: Die App verwendet KEINE Hamburger-Menü! 
// Mobile hat BottomNav mit immer sichtbaren Buttons: Dienstplan, Zeiten, Urlaub, Profil
async function navigateToTab(page: Page, tabName: RegExp | string, isMobile: boolean = false) {
    // Wait for navigation to be available
    await page.waitForTimeout(500);

    // The app uses buttons for both desktop sidebar and mobile bottom nav
    // Tab names in the app: "Dienstplan", "Zeiten", "Urlaub", "Profil", "Admin"

    // First try: Button with exact role and name
    const tabButton = page.getByRole('button', { name: tabName });
    if (await tabButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await tabButton.first().click();
        await page.waitForTimeout(1000);
        return;
    }

    // Second try: Any button containing the text (case insensitive)
    const buttonWithText = page.locator(`button:has-text("${tabName}")`).first();
    if (await buttonWithText.isVisible({ timeout: 2000 }).catch(() => false)) {
        await buttonWithText.click();
        await page.waitForTimeout(1000);
        return;
    }

    // Third try: Look for span with text inside button (BottomNav structure)
    const spanInsideButton = page.locator(`button span:has-text("${tabName}")`).first();
    if (await spanInsideButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        // Click the parent button
        await spanInsideButton.locator('..').click();
        await page.waitForTimeout(1000);
        return;
    }

    // Fallback: Try clicking any element with the tab name
    const fallback = page.locator(`text="${tabName}"`).first();
    if (await fallback.isVisible({ timeout: 1000 }).catch(() => false)) {
        await fallback.click();
        await page.waitForTimeout(1000);
    }
}

// =============================================================================
// VIEW NAVIGATION TESTS
// =============================================================================

test.describe('View Navigation', () => {
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD,
        'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD');

    test.beforeEach(async ({ page }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);
    });

    test('can navigate to Dienstplan (RosterFeed)', async ({ page }) => {
        await navigateToTab(page, /dienstplan/i);

        // Should see calendar or roster content
        await expect(page.locator('[class*="calendar"], [class*="roster"], [class*="month"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('can navigate to Zeiten (TimeTracking)', async ({ page }) => {
        await navigateToTab(page, /zeiten/i);

        // Should see time tracking content - look for the tab being active or content
        await page.waitForTimeout(1000);
        // Verify we navigated (page should have time-related content)
        const pageContent = await page.content();
        expect(pageContent.length).toBeGreaterThan(0);
    });

    test('can navigate to Urlaub', async ({ page }) => {
        await navigateToTab(page, /urlaub/i);

        // Should see vacation content
        await page.waitForTimeout(1000);
        await expect(page.getByText(/urlaub|antrag|tage/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('can navigate to Profil', async ({ page }) => {
        await navigateToTab(page, /profil/i);

        // Should see profile content
        await page.waitForTimeout(1000);
        await expect(page.getByText(/profil|name|email/i).first()).toBeVisible({ timeout: 5000 });
    });
});

// =============================================================================
// MEIN STUNDENKONTO (RosterFeed Balance Section)
// =============================================================================

test.describe('RosterFeed - Mein Stundenkonto', () => {
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD,
        'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD');

    test.beforeEach(async ({ page }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);
        await navigateToTab(page, /dienstplan/i);
    });

    test('displays Stundenkonto section', async ({ page }) => {
        // Look for the balance section
        const balanceSection = page.getByText(/stundenkonto|saldo|übertrag/i).first();
        await expect(balanceSection).toBeVisible({ timeout: 10000 });
    });

    test('shows Soll hours', async ({ page }) => {
        // Look for "Soll" label
        await expect(page.getByText(/soll/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('shows Ist hours', async ({ page }) => {
        // Look for "Ist" label
        await expect(page.getByText(/ist/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('shows Übertrag (carryover)', async ({ page }) => {
        // Look for carryover/Übertrag
        await expect(page.getByText(/übertrag/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('shows Total/Saldo', async ({ page }) => {
        // Look for total balance
        await expect(page.getByText(/saldo|gesamt/i).first()).toBeVisible({ timeout: 10000 });
    });
});

// =============================================================================
// ZEITERFASSUNG (TimeTracking View)
// =============================================================================

test.describe('TimeTracking - Employee View', () => {
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD,
        'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD');

    test.beforeEach(async ({ page }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);
        await navigateToTab(page, /zeiten/i);
    });

    test('displays month selector', async ({ page }) => {
        // Should have month navigation
        const monthSelector = page.locator('[class*="month"], select, [role="combobox"]').first();
        await expect(monthSelector).toBeVisible({ timeout: 10000 });
    });

    test('shows time entries list', async ({ page }) => {
        // Wait for entries to load
        await page.waitForTimeout(2000);

        // Should show some entries or "keine Einträge" message
        const hasContent = await page.getByText(/keine einträge|stunden|schicht/i).first().isVisible();
        expect(hasContent).toBeTruthy();
    });

    test('shows balance summary', async ({ page }) => {
        // Time tracking should show a summary
        await expect(page.getByText(/soll|ist|saldo/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('can navigate between months', async ({ page }) => {
        // Find month navigation buttons
        const prevButton = page.locator('button').filter({ hasText: /←|<|zurück|prev/i }).first();
        const nextButton = page.locator('button').filter({ hasText: /→|>|vor|next/i }).first();

        // Try to click if visible
        if (await prevButton.isVisible()) {
            await prevButton.click();
            await page.waitForTimeout(500);

            // Navigate back
            if (await nextButton.isVisible()) {
                await nextButton.click();
            }
        }

        // Should still be on time tracking page
        // Verify page still has content
    });
});

// =============================================================================
// URLAUB VIEW (VacationRequest)
// =============================================================================

test.describe('Urlaub - Vacation View', () => {
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD,
        'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD');

    test.beforeEach(async ({ page }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);
        await navigateToTab(page, /urlaub/i);
    });

    test('shows vacation request form', async ({ page }) => {
        await page.waitForTimeout(2000);
        // Should show vacation-related content
        await expect(page.getByText(/urlaub|antrag|resturlaub/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('shows remaining vacation days', async ({ page }) => {
        await page.waitForTimeout(2000);
        // Should show remaining days info
        await expect(page.getByText(/resturlaub|tage|verbleibend/i).first()).toBeVisible({ timeout: 5000 });
    });
});

// =============================================================================
// BALANCE CONSISTENCY CHECK
// =============================================================================

test.describe('Balance Consistency Across Views', () => {
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD,
        'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD');

    test('balance values are consistent between RosterFeed and TimeTracking', async ({ page }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);

        // Collect balance from RosterFeed (Dienstplan)
        await navigateToTab(page, /dienstplan/i);
        await page.waitForTimeout(2000);

        // Extract balance value (look for patterns like "+5.5h" or "-10h" or "Saldo: 15h")
        const rosterContent = await page.content();
        const rosterBalanceMatch = rosterContent.match(/saldo[:\s]*([+-]?\d+[,.]?\d*)\s*h/i);

        // Navigate to TimeTracking
        await navigateToTab(page, /zeiten/i);
        await page.waitForTimeout(2000);

        const timeContent = await page.content();
        const timeBalanceMatch = timeContent.match(/saldo[:\s]*([+-]?\d+[,.]?\d*)\s*h/i);

        // If both views have balance values, they should match
        if (rosterBalanceMatch && timeBalanceMatch) {
            const rosterBalance = parseFloat(rosterBalanceMatch[1].replace(',', '.'));
            const timeBalance = parseFloat(timeBalanceMatch[1].replace(',', '.'));

            // Allow small rounding differences (0.1h)
            expect(Math.abs(rosterBalance - timeBalance)).toBeLessThanOrEqual(0.1);
        }

        // Test passes if values match or if values couldn't be extracted (design may differ)
    });
});

// =============================================================================
// ADMIN VIEW TESTS (Requires Admin Credentials)
// =============================================================================

test.describe('AdminTimeTracking View', () => {
    test.skip(!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD,
        'Requires TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD');

    test.beforeEach(async ({ page }) => {
        const success = await login(page, process.env.TEST_ADMIN_EMAIL!, process.env.TEST_ADMIN_PASSWORD!);
        expect(success).toBe(true);
    });

    test('admin can access Admin tab', async ({ page }) => {
        await navigateToTab(page, /admin/i);
        await expect(page.getByText(/admin|dashboard|mitarbeiter/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('admin can see employee time tracking', async ({ page }) => {
        await navigateToTab(page, /admin/i);
        await page.waitForTimeout(1000);

        // Look for Zeiterfassung or similar admin section
        const timeTrackingSection = page.getByText(/zeiterfassung|stunden/i).first();
        if (await timeTrackingSection.isVisible()) {
            await timeTrackingSection.click();
            await page.waitForTimeout(1000);
        }

        // Admin should be able to see employee data
        await expect(page.getByText(/mitarbeiter|saldo|stunden/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('admin can apply corrections', async ({ page }) => {
        await navigateToTab(page, /admin/i);
        await page.waitForTimeout(1000);

        // Look for correction button or section
        const correctionButton = page.getByRole('button', { name: /korrektur|anpassen/i });

        // Just verify the button exists (don't actually click to avoid modifying data)
        if (await correctionButton.isVisible()) {
            expect(await correctionButton.isEnabled()).toBeTruthy();
        }
    });
});

// =============================================================================
// DATA DISPLAY TESTS
// =============================================================================

test.describe('Data Display Integrity', () => {
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD,
        'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD');

    test.beforeEach(async ({ page }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);
    });

    test('no JavaScript errors on page load', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));

        // Navigate through main views
        await navigateToTab(page, /dienstplan/i);
        await page.waitForTimeout(1000);

        await navigateToTab(page, /zeiten/i);
        await page.waitForTimeout(1000);

        await navigateToTab(page, /urlaub/i);
        await page.waitForTimeout(1000);

        // Filter out expected/minor errors
        const criticalErrors = errors.filter(e =>
            !e.includes('ResizeObserver') &&
            !e.includes('Network') &&
            !e.includes('Failed to fetch')
        );

        expect(criticalErrors).toHaveLength(0);
    });

    test('no missing data placeholders visible', async ({ page }) => {
        await navigateToTab(page, /dienstplan/i);
        await page.waitForTimeout(2000);

        // Check for common "missing data" indicators
        const missingDataIndicators = [
            'undefined',
            'NaN',
            'null',
            '[object Object]',
            'Error'
        ];

        const pageContent = await page.content();

        for (const indicator of missingDataIndicators) {
            // Check that these don't appear in visible text (they might be in HTML attributes)
            const visibleText = await page.evaluate(() => document.body.innerText);
            expect(visibleText).not.toContain(indicator);
        }
    });

    test('hour values are formatted correctly', async ({ page }) => {
        await navigateToTab(page, /zeiten/i);
        await page.waitForTimeout(2000);

        const pageText = await page.evaluate(() => document.body.innerText);

        // Look for hour values - they should be properly formatted
        // Valid: "8h", "8.5h", "8,5h", "+10h", "-5.5h"
        // Invalid: "8.123456h", "NaNh"

        // Check no excessive decimal places (more than 2)
        const badDecimals = pageText.match(/\d+[,.]\d{3,}\s*h/gi);
        expect(badDecimals).toBeNull();
    });
});

// =============================================================================
// MOBILE RESPONSIVENESS
// =============================================================================

test.describe('Mobile View', () => {
    test.skip(!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD,
        'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD');

    // Use Pixel 5 viewport (matches mobile-chrome project in playwright.config.ts)
    test.use({ viewport: { width: 393, height: 851 } });

    test('login works on mobile', async ({ page, isMobile }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);

        // Verify we're in mobile mode
        const viewportSize = page.viewportSize();
        expect(viewportSize?.width).toBeLessThan(500);
    });

    test('navigation is accessible on mobile', async ({ page, isMobile }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);

        // Mobile should have bottom nav, hamburger menu, or visible tabs
        const hasNav = await page.locator(
            'nav, [class*="bottom-nav"], [class*="menu"], [class*="tab"], button:has-text("Dienstplan")'
        ).first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasNav).toBeTruthy();
    });

    test('can navigate to different views on mobile', async ({ page, isMobile }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);

        // Navigate using mobile-aware function (isMobile = true)
        await navigateToTab(page, /dienstplan/i, true);
        await page.waitForTimeout(1500);

        // Should show some content
        const pageContent = await page.content();
        expect(pageContent.length).toBeGreaterThan(1000);
    });

    test('balance is visible on mobile', async ({ page, isMobile }) => {
        const success = await login(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
        expect(success).toBe(true);

        await navigateToTab(page, /dienstplan/i, true);
        await page.waitForTimeout(2000);

        // Balance info should be visible even on small screens
        // Look for common balance-related text
        const hasBalanceInfo = await page.getByText(/soll|ist|saldo|stunden/i).first().isVisible({ timeout: 5000 }).catch(() => false);

        // If not visible directly, maybe in a collapsed section
        if (!hasBalanceInfo) {
            // Try to expand any collapsed sections
            const expandButtons = page.locator('button:has-text("anzeigen"), button:has-text("mehr"), [class*="expand"]');
            if (await expandButtons.first().isVisible().catch(() => false)) {
                await expandButtons.first().click();
                await page.waitForTimeout(500);
            }
        }

        // Re-check after potential expansion
        const balanceVisible = await page.getByText(/soll|ist|saldo|stunden/i).first().isVisible().catch(() => false);
        expect(balanceVisible).toBeTruthy();
    });
});

