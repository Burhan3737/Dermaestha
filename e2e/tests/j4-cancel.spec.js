// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, readAppointmentState, prisma } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});

// J4 cancellation WITHOUT refund (manual-payment pivot §7.4: cancelling forfeits; all money
// movement is handled offline by the admin — there is no in-app refund). The confirmed future
// appointment (fee Rs 5,000, unique on the Upcoming list) is cancelled to `cancelled`.
test.describe('J4 cancel (no refund)', () => {
  test('patient cancels a confirmed appointment → cancelled, no refund copy', async ({ page }) => {
    await loginUi(page, EMAILS.patient);
    await expect(page).toHaveURL(/\/browse/);
    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'Upcoming appointments' })).toBeVisible();

    const row = page.locator('.appt-row', { hasText: 'Rs 5,000' });
    await row.getByRole('button', { name: 'Cancel' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('This cannot be undone.')).toBeVisible();
    // No refund machinery anywhere in the manual model.
    await expect(dialog.getByText(/refund/i)).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Cancel appointment' }).click();

    await expect
      .poll(async () => (await readAppointmentState(seedIds.appts.futureConfirmed))?.state)
      .toBe('cancelled');
  });
});
