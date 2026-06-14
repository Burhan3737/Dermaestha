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

    // Pick the first available slot (seeded today-window guarantees ≥1).
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

  // BUG-1 (product defect, High): the payment.failed webhook path 500s. processWebhook()
  // (server/src/modules/payment/service.js) deletes the slot_locked appointment while its
  // pending Payment row still FK-references it — Payment.appointment has no onDelete:Cascade
  // (prisma/schema.prisma ~L211), so prisma.appointment.deleteMany throws P2003. The slot is
  // not released until lock expiry, and the user sees a 500. (reconcileOne's failed branch,
  // service.js ~L180, has the same defect.) Flip to `test(` once the controller fixes it.
  test.fixme('Fail at checkout releases the lock (no confirmation)', async ({ page }) => {
    await signupUi(page, { fullName: 'J1 Fail', email: uniqueEmail('j1fail'), phone: '03007770002' });
    await expect(page).toHaveURL(/\/browse/);
    await page.getByRole('link', { name: /Dr E2E Primary/ }).click();
    await page.locator('button.slot').first().click();
    await page.getByRole('button', { name: 'Confirm & Pay' }).click();
    await expect(page).toHaveURL(/\/dev\/checkout/);

    // payment.failed deletes the slot_locked appt → detail 404 → "Payment did not complete".
    await page.getByRole('button', { name: 'Fail' }).click();
    await expect(page).toHaveURL(/\/pay\/return/);
    await expect(page.getByRole('heading', { name: 'Payment did not complete' })).toBeVisible();
  });
});
