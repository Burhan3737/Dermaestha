// @ts-check
import { test, expect } from '@playwright/test';
import { signupUi, uniqueEmail } from '../support/auth.js';

// J1 book → pay → confirm.
// Tags: F01.01 (TC-F01-001 consent gate), F03.03 (TC-F03-005 slot-lock),
// F04.01 (TC-F04-001 pay-at-booking), F04.02 (TC-F04-002 webhook-truth); invariants #2/#6/#7.
test.describe('J1 book → pay → confirm', () => {
  test('signup → browse → book → pay → appointment confirmed', async ({ page }) => {
    await signupUi(page, { fullName: 'J1 Patient', email: uniqueEmail('j1'), phone: '03007770001' });
    await expect(page).toHaveURL(/\/browse/);

    // Browse → the seeded E2E primary doctor.
    await page.getByRole('link', { name: /Dr E2E Primary/ }).click();
    await expect(page.getByRole('heading', { name: /Dr E2E Primary/ })).toBeVisible();

    // Book on a future day via the day picker (ISSUE-1) — time-independent vs. a same-day slot.
    await page.getByRole('tab').nth(1).click();
    const slot = page.locator('button.slot').first();
    await expect(slot).toBeVisible();
    await slot.click();

    // Booking → Confirm & Pay → mock hosted checkout.
    await expect(page).toHaveURL(/\/book\//);
    await page.getByRole('button', { name: 'Confirm & Pay' }).click();
    await expect(page).toHaveURL(/\/dev\/checkout/);

    // Pay → signed IPN → real webhook confirm → PaymentReturn polls to confirmed.
    await page.getByRole('button', { name: 'Pay' }).click();
    await expect(page).toHaveURL(/\/pay\/return/);
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();

    await page.getByRole('link', { name: 'View my appointments' }).click();
    await expect(page.getByRole('heading', { name: 'Upcoming appointments' })).toBeVisible();
    await expect(page.getByText(/Dr E2E Primary/)).toBeVisible();
  });

  // BUG-1 fixed (Option B): the payment.failed webhook path marks the Payment `failed` and
  // force-expires the slot lock instead of deleting the appointment (Payment.appointment is
  // ON DELETE RESTRICT — a delete P2003'd, 500'd, and never released the slot). The appointment
  // row is kept (lock expired), so the slot is reclaimable via lazy-expiry / reclaim-on-conflict.
  test('Fail at checkout releases the lock (no confirmation)', async ({ page }) => {
    await signupUi(page, { fullName: 'J1 Fail', email: uniqueEmail('j1fail'), phone: '03007770002' });
    await expect(page).toHaveURL(/\/browse/);
    await page.getByRole('link', { name: /Dr E2E Primary/ }).click();
    await page.getByRole('tab').nth(1).click();
    await page.locator('button.slot').first().click();
    await page.getByRole('button', { name: 'Confirm & Pay' }).click();
    await expect(page).toHaveURL(/\/dev\/checkout/);

    // payment.failed → no confirmation (the booking is never confirmed). Option B keeps the
    // slot_locked row with an expired lock, so the return page never reaches "Booking confirmed".
    await page.getByRole('button', { name: 'Fail' }).click();
    await expect(page).toHaveURL(/\/pay\/return/);
    // Positive terminal state (ISSUE-3): a Failure/Lock-released card, not an infinite poll.
    await expect(page.getByRole('heading', { name: 'Payment not completed' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toHaveCount(0);

    // The slot is freed: re-book the same earliest slot. This exercises reclaim-on-conflict over
    // the expired, payment-attached blocker (the FK that P2003'd pre-fix) and lands on /book/.
    await page.goto('/browse');
    await page.getByRole('link', { name: /Dr E2E Primary/ }).click();
    await page.getByRole('tab').nth(1).click();
    await page.locator('button.slot').first().click();
    await expect(page).toHaveURL(/\/book\//);
  });
});
