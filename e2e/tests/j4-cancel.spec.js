// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, readAppointmentState, prisma } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});

// J4 cancel / refund.
// Tags: F06.01 free-cancel (TC-F06-001), late-cancel (TC-F06-002), net-of-fee (TC-F06-003);
// invariant #10. Rows distinguished by fee text (Rs 5,000 free / Rs 6,000 late).
test.describe('J4 cancel / refund', () => {
  test.beforeEach(async ({ page }) => {
    await loginUi(page, EMAILS.patient);
    await expect(page).toHaveURL(/\/browse/);
    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'Upcoming appointments' })).toBeVisible();
  });

  test('cancel ≥2h before → cancelled_refunded with refund number shown', async ({ page }) => {
    const row = page.locator('.appt-row', { hasText: 'Rs 5,000' });
    await row.getByRole('button', { name: 'Cancel' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Refund:/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel & refund' }).click();
    await expect
      .poll(async () => (await readAppointmentState(seedIds.appts.free))?.state)
      .toBe('cancelled_refunded');
  });

  test('cancel <2h before → cancelled_no_refund', async ({ page }) => {
    const row = page.locator('.appt-row', { hasText: 'Rs 6,000' });
    await row.getByRole('button', { name: 'Cancel' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/No refund available/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel anyway' }).click();
    await expect
      .poll(async () => (await readAppointmentState(seedIds.appts.late))?.state)
      .toBe('cancelled_no_refund');
  });
});
