// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';

// J8 logout reachability (ISSUE-2). The audit found NO logout in the doctor/admin chrome and none
// on patient desktop. doc 06 §2: patient desktop nav includes Profile (which hosts logout); the
// doctor/admin sidebar must offer a logout affordance. Desktop viewport (default project).
test.describe('J8 logout reachability', () => {
  test('doctor can log out from the sidebar', async ({ page }) => {
    await loginUi(page, 'e2e.doctor@dermestha.test');
    await expect(page).toHaveURL(/\/doctor/);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('admin can log out from the sidebar', async ({ page }) => {
    await loginUi(page, 'e2e.admin@dermestha.test');
    await expect(page).toHaveURL(/\/admin/);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('patient logs out via the desktop Profile page', async ({ page }) => {
    await loginUi(page, 'e2e.patient@dermestha.test');
    await expect(page).toHaveURL(/\/browse/);
    // The mobile tab bar is CSS-hidden on desktop; the Profile link lives in the top nav.
    await page.locator('.topnav').getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText('E2E Patient')).toBeVisible(); // basic details (ISSUE-11)
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
