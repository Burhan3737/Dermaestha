// @ts-check
import { test, expect } from '@playwright/test';
import { signupUi, uniqueEmail } from '../support/auth.js';

// J10 pending-hold recovery: an abandoned checkout leaves a live slot-lock; the patient finds and
// completes it from Appointments (Payment-pending card), reached via the booking-page recovery link.
// Tags: F03.03 Single-Lock; pending-hold visibility + recovery.
test.describe('J10 pending-hold recovery', () => {
  test('abandoned hold is recoverable from appointments via the booking-page link', async ({ page }) => {
    await signupUi(page, { fullName: 'J10 Patient', email: uniqueEmail('j10'), phone: '03007770010' });
    await expect(page).toHaveURL(/\/browse/);

    // Book a slot → Confirm & Pay → mock checkout, then ABANDON (navigate away without paying).
    await page.getByRole('link', { name: /Dr E2E Primary/ }).click();
    await page.getByRole('tab').nth(1).click();
    await page.locator('button.slot').first().click();
    await expect(page).toHaveURL(/\/book\//);
    await page.getByRole('button', { name: 'Confirm & Pay' }).click();
    await expect(page).toHaveURL(/\/dev\/checkout/);

    // Abandon → try to book a DIFFERENT slot → Single-Lock 409 → recovery message + link.
    await page.goto('/browse');
    await page.getByRole('link', { name: /Dr E2E Primary/ }).click();
    await page.getByRole('tab').nth(1).click();
    await page.locator('button.slot').first().click();
    await expect(page).toHaveURL(/\/book\//);
    await page.getByRole('button', { name: 'Confirm & Pay' }).click();
    await expect(page.getByText('Finish your current booking first.')).toBeVisible();

    // Discoverability link → Appointments → Payment-pending card.
    await page.getByRole('link', { name: 'Go to your pending booking' }).click();
    await expect(page).toHaveURL(/\/appointments/);
    await expect(page.getByText(/Payment pending/)).toBeVisible();

    // Complete payment → mock checkout → Pay → confirmed.
    await page.getByRole('button', { name: 'Complete payment' }).click();
    await expect(page).toHaveURL(/\/dev\/checkout/);
    await page.getByRole('button', { name: 'Pay' }).click();
    await expect(page).toHaveURL(/\/pay\/return/);
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  });
});
