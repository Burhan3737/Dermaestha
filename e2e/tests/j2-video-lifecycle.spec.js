// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, prisma } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});

// J2 video (manual-payment pivot §7.3, §11; 3-state model — no `completed` state, no completion
// cron). The mock provider no longer simulates an in-call join (joinSimUrl is null); the
// deterministic, provider-independent surface is the waiting room + the video-token gate
// (confirmed-only). No join recording, no no-show, no completion.
test.describe('J2 video', () => {
  test('confirmed appointment renders the video room; the room is gated on confirmed', async ({
    page,
  }) => {
    const confirmedId = seedIds.appts.video;
    const pendingId = seedIds.appts.pendingRef;

    await loginUi(page, EMAILS.patient);
    await expect(page).toHaveURL(/\/browse/);

    // The patient's "Join Call" lands on the waiting room for a confirmed, in-window appointment.
    await page.goto(`/video/${confirmedId}/ready`);
    await expect(page.getByRole('heading', { name: 'Waiting room' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join Call' })).toBeVisible();

    // The video-token endpoint authorizes the room only for a confirmed appointment…
    const okRes = await page.request.get(`/api/appointments/${confirmedId}/video-token`);
    expect(okRes.status()).toBe(200);
    // …and refuses a pending one (no room before the admin confirms payment).
    const pendingRes = await page.request.get(`/api/appointments/${pendingId}/video-token`);
    expect(pendingRes.ok()).toBeFalsy();
  });
});
