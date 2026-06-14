// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, PASSWORD } from '../support/db.js';

// J6 admin onboarding.
// Tags: F10.01 (TC-F10-001 pending-state create), F15.02 DA3 (TC-F15-002 first-login change).
test('admin onboards a doctor → first login forces password change', async ({ browser }) => {
  const stamp = Date.now();
  const newEmail = `e2e.newdoc.${stamp}@dermestha.test`;
  const pmc = `E2E-NEW-${stamp}`;

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginUi(adminPage, EMAILS.admin);
  await expect(adminPage).toHaveURL(/\/admin/);
  await adminPage.goto('/admin/doctors');
  await adminPage.getByRole('button', { name: 'Add doctor' }).click();

  await adminPage.getByLabel('Full name').fill('Dr Onboarded E2E');
  await adminPage.getByLabel('Email').fill(newEmail);
  await adminPage.getByLabel('PMC number').fill(pmc);
  await adminPage.getByLabel('Phone').fill('03009990000');
  await adminPage.getByLabel('Specialization').fill('E2E Onboard');
  await adminPage.getByLabel('Consultation fee (PKR)').fill('3000');
  await adminPage.getByLabel('Bio').fill('Onboarded by E2E.');
  await adminPage.getByLabel('Initial password').fill(PASSWORD);
  await adminPage.getByRole('button', { name: 'Save doctor' }).click();

  await expect(adminPage.getByText('Dr Onboarded E2E')).toBeVisible();
  await adminCtx.close();

  // First login forces the DA3 password change.
  const docCtx = await browser.newContext();
  const docPage = await docCtx.newPage();
  await loginUi(docPage, newEmail, PASSWORD);
  await expect(docPage).toHaveURL(/\/doctor\/change-password/);
  await docCtx.close();
});
