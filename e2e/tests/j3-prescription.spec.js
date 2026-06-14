// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, readAppointmentState, prisma } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});

// J3 prescription.
// Tags: F08.02 immutable submit (TC-F08-008), F08.01 client-render download (TC-F08-006);
// invariants #4/#5.
test('doctor issues a prescription → patient views it + PDF download', async ({ browser }) => {
  const id = seedIds.appts.prescription;

  const docCtx = await browser.newContext();
  const docPage = await docCtx.newPage();
  await loginUi(docPage, EMAILS.doctor);
  await expect(docPage).toHaveURL(/\/doctor/); // wait for the session before deep-linking
  await docPage.goto(`/doctor/appointments/${id}/prescribe`);
  await expect(docPage.getByRole('heading', { name: 'Write prescription' })).toBeVisible();

  await docPage.getByLabel('Add medicine').fill('E2E');
  // Target the named catalogue option (auto-waits for the async search) — NOT .first(),
  // which can race onto the free-text fallback before results load.
  await docPage.getByRole('option', { name: /E2E Acne Cream/ }).click();
  await docPage.locator('#dosage-0').fill('1 tab daily');
  await docPage.locator('#duration-0').fill('14 days');
  await docPage.locator('#instructions-0').fill('After food');
  await docPage.getByRole('button', { name: 'Submit prescription' }).click();
  await docPage.getByRole('button', { name: 'Confirm & issue' }).click();
  await expect(docPage).toHaveURL(/\/doctor$/);

  await expect
    .poll(async () => (await readAppointmentState(id))?.state)
    .toBe('prescription_issued');
  await docCtx.close();

  const patCtx = await browser.newContext();
  const patPage = await patCtx.newPage();
  await loginUi(patPage, EMAILS.patient);
  await expect(patPage).toHaveURL(/\/browse/); // wait for the session before deep-linking
  await patPage.goto(`/appointments/${id}/prescriptions`);
  await expect(patPage.getByRole('heading', { name: 'Prescriptions' })).toBeVisible();
  await expect(patPage.getByText('E2E Acne Cream')).toBeVisible();
  await expect(patPage.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  await patCtx.close();
});
