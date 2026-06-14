// @ts-check
import { PASSWORD } from './db.js';

export async function loginUi(page, email, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

export async function signupUi(page, { fullName, email, phone, password = PASSWORD }) {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill(fullName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone').fill(phone);
  await page.getByLabel('Password').fill(password);
  await page.locator('#tos').check();
  await page.getByRole('button', { name: 'Create account' }).click();
}

export function uniqueEmail(prefix) {
  return `e2e.${prefix}.${Date.now()}@dermestha.test`;
}
