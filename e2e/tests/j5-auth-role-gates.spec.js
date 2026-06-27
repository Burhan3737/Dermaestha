// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, PASSWORD } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

// J5 auth role gates.
// Tags: F15.03 / TC-SEC-001 (admin block), F15.02 DA3 / TC-SEC-005 (forced change),
// TC-SEC-002 / TC-SEC-007 (404 no-leak).
test.describe('J5 auth role gates', () => {
  test('patient cannot reach /admin (client redirect + API 403)', async ({ page }) => {
    await loginUi(page, EMAILS.patient);
    await expect(page).toHaveURL(/\/browse/);
    await page.goto('/admin/doctors');
    await expect(page).not.toHaveURL(/\/admin/); // RoleRoute → "/"
    const res = await page.request.get('/api/admin/settings');
    expect(res.status()).toBe(403);
  });

  test('DA3 forced password change loop clears after change', async ({ page }) => {
    await loginUi(page, EMAILS.da3doctor);
    await expect(page).toHaveURL(/\/doctor\/change-password/);
    await page.getByLabel('Current password').fill(PASSWORD);
    await page.getByLabel('New password').fill('E2eNewPass1!');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page).toHaveURL(/\/doctor$/);
    await expect(page.getByRole('heading', { name: /appointments/i })).toBeVisible();
  });

  test('404 no-leak: patient2 cannot read patient1 appointment', async ({ page }) => {
    await loginUi(page, EMAILS.patient2);
    await expect(page).toHaveURL(/\/browse/);
    const res = await page.request.get(`/api/appointments/${seedIds.appts.prescription}`);
    expect(res.status()).toBe(404);
  });
});
