// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi, signupUi, uniqueEmail } from '../support/auth.js';
import { EMAILS, readAppointmentState, prisma } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});

// J1 manual payment: book → submit bank reference → admin accept → confirmed.
// Manual-payment pivot §7.1/§7.2, §11 acceptance. No gateway, no /dev/checkout, no /pay/return.
test.describe('J1 book → pay → confirm (manual)', () => {
  test('patient books, submits a bank reference, admin accepts, appointment confirmed', async ({
    browser,
  }) => {
    const ref = `E2E-TXN-J1-${Date.now()}`;
    const patientCtx = await browser.newContext();
    const page = await patientCtx.newPage();

    await signupUi(page, { fullName: 'J1 Patient', email: uniqueEmail('j1'), phone: '03007770001' });
    await expect(page).toHaveURL(/\/browse/);

    // Browse → the seeded E2E primary doctor → book a future-day slot via the day picker.
    await page.getByRole('link', { name: /Dr E2E Primary/ }).click();
    await expect(page.getByRole('heading', { name: /Dr E2E Primary/ })).toBeVisible();
    await page.getByRole('tab').nth(1).click();
    const slot = page.locator('button.slot').first();
    await expect(slot).toBeVisible();
    await slot.click();

    // Booking → "Confirm booking" locks the slot (pending) and lands on the PaymentInstructions screen.
    await expect(page).toHaveURL(/\/book\/[^/]+\?/);
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await page.waitForURL(/\/book\/pay\//);
    const apptId = page.url().split('?')[0].split('/').pop();

    // Bank instructions (from Settings) + amount due are shown.
    await expect(page.getByRole('heading', { name: 'Pay for your appointment' })).toBeVisible();
    await expect(page.getByText('E2E Test Bank')).toBeVisible();
    await expect(page.getByText('Rs 2,500')).toBeVisible();

    // Submit the bank transaction reference → POST /appointments/:id/pay → stays pending, awaiting admin.
    await page.getByLabel('Bank transaction reference').fill(ref);
    await page.getByRole('button', { name: /submit reference/i }).click();
    await expect(page.getByText(/Awaiting confirmation/)).toBeVisible();

    // The appointment is still pending until the admin verifies the transfer.
    expect((await readAppointmentState(apptId))?.state).toBe('pending');

    // Admin logs in → Payment review → finds this booking by its bank reference → Accept.
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await loginUi(adminPage, EMAILS.admin);
    await expect(adminPage).toHaveURL(/\/admin/);
    await adminPage.goto('/admin/review');
    await expect(adminPage.getByRole('heading', { name: 'Payment review' })).toBeVisible();
    const adminRow = adminPage.locator('tr', { hasText: ref });
    await expect(adminRow).toBeVisible();
    await adminRow.getByRole('button', { name: 'Accept' }).click();
    await expect(adminPage.locator('tr', { hasText: ref })).toHaveCount(0);
    await adminCtx.close();

    // Patient now sees the appointment confirmed (state + UI badge).
    await expect
      .poll(async () => (await readAppointmentState(apptId))?.state)
      .toBe('confirmed');
    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'Upcoming appointments' })).toBeVisible();
    await expect(page.getByText('Confirmed').first()).toBeVisible();
    await patientCtx.close();
  });

  test('admin reject moves a pending booking to cancelled (slot freed)', async ({ page }) => {
    const id = seedIds.appts.pendingRef;
    await loginUi(page, EMAILS.admin);
    await expect(page).toHaveURL(/\/admin/);
    await page.goto('/admin/review');
    await expect(page.getByRole('heading', { name: 'Payment review' })).toBeVisible();

    const row = page.locator('tr', { hasText: 'E2E-SEED-REJECT-REF' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Reject' }).click();
    await expect(page.locator('tr', { hasText: 'E2E-SEED-REJECT-REF' })).toHaveCount(0);

    await expect.poll(async () => (await readAppointmentState(id))?.state).toBe('cancelled');
  });
});
