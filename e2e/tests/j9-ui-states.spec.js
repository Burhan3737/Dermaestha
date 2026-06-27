// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

// J9 UI states — small fallback/empty surfaces the audit flagged.
test.describe('J9 UI states', () => {
  test('unknown route renders a dedicated 404 page (ISSUE-8)', async ({ page }) => {
    await page.goto('/totally-bogus-path-xyz');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    // The old "Coming in a later slice." placeholder must not be the 404.
    await expect(page.getByText(/coming in a later slice/i)).toHaveCount(0);
  });

  test('cross-tenant prescription shows a not-available message, not a blank page (ISSUE-10)', async ({ page }) => {
    await loginUi(page, EMAILS.patient2);
    await expect(page).toHaveURL(/\/browse/);
    // patient2 opens patient1's prescription appointment → API 404 (no leak) → UI message.
    await page.goto(`/appointments/${seedIds.appts.prescription}/prescriptions`);
    await expect(page.getByText('This prescription is not available.')).toBeVisible();
  });

  test('appointment lists render the 4-state badges (manual-payment model)', async ({ page }) => {
    await loginUi(page, EMAILS.patient);
    await expect(page).toHaveURL(/\/browse/);

    // Upcoming holds the active states: a pending booking and a confirmed one.
    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'Upcoming appointments' })).toBeVisible();
    await expect(page.getByText('Payment pending').first()).toBeVisible();
    await expect(page.getByText('Confirmed').first()).toBeVisible();

    // History holds the terminal states: completed and cancelled.
    await page.goto('/appointments/history');
    await expect(page.getByText('Completed').first()).toBeVisible();
    await expect(page.getByText('Cancelled').first()).toBeVisible();
  });
});
