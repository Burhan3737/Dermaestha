// @ts-check
import { test, expect } from '@playwright/test';
import { signupUi, uniqueEmail } from '../support/auth.js';

// J7 future-day booking (ISSUE-1 fix). A doctor available ONLY on a future weekday (today+2) is
// bookable solely by navigating the P-03 day picker. Proves F03.01 future-slots-only spans days
// (doc 06 §3 "Slots are grouped under day tabs"); the old funnel locked to today dead-ended here.
test.describe('J7 future-day booking', () => {
  test('book a slot on a future day via the day picker', async ({ page }) => {
    await signupUi(page, { fullName: 'J7 Patient', email: uniqueEmail('j7'), phone: '03007770007' });
    await expect(page).toHaveURL(/\/browse/);

    await page.getByRole('link', { name: /Dr E2E Future/ }).click();
    await expect(page.getByRole('heading', { name: /Dr E2E Future/ })).toBeVisible();

    // "Today" tab: this doctor has no same-day availability → no slots (pre-fix dead-end).
    await expect(page.getByText('No slots available on this day.')).toBeVisible();
    await expect(page.locator('button.slot')).toHaveCount(0);

    // Navigate to the future day (today+2) the doctor is actually available on.
    await page.getByRole('tab').nth(2).click();
    const slot = page.locator('button.slot').first();
    await expect(slot).toBeVisible();
    await slot.click();

    // Future-day slot → book → pay → confirm.
    await expect(page).toHaveURL(/\/book\//);
    await page.getByRole('button', { name: 'Confirm & Pay' }).click();
    await expect(page).toHaveURL(/\/dev\/checkout/);
    await page.getByRole('button', { name: 'Pay' }).click();
    await expect(page).toHaveURL(/\/pay\/return/);
    await expect(page.getByRole('heading', { name: 'Booking confirmed' })).toBeVisible();
  });
});
