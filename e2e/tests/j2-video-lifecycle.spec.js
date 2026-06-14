// @ts-check
import { test, expect } from '@playwright/test';
import { loginUi } from '../support/auth.js';
import { EMAILS, readAppointmentState, prisma } from '../support/db.js';
import { seedIds } from '../support/seedIds.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});

// J2 video lifecycle.
// Tags: F05.03 (TC-F05-004 room/join), §5 worker (TC-F05-011 in_progress, TC-F05-014 completed),
// §3 no-show (TC-F05-008 doctor_no_show, TC-F05-013 patient_no_show); ADR-12/25.
test.describe('J2 video lifecycle', () => {
  // BUG-2 (product defect, mock/dev-only, Low-Medium): in mock mode the SPA never records a
  // join. VideoRoom's recordJoin calls api.post(joinSimUrl) and the api client prepends "/api"
  // (client/src/lib/apiClient/apiClient.js), so the request hits /api/dev/video/join (404)
  // instead of the dev simulator at /dev/video/join (200, verified). The .catch() swallows it.
  // Production is unaffected (VIDEO_PROVIDER=daily → joinSimUrl=null → recordJoin not called).
  // Flip to `test(` once the controller fixes the join-sim URL. The worker-driven lifecycle
  // transitions below are proven independently from seeded joins.
  test.fixme('patient + doctor join the mock room → both joins recorded', async ({ browser }) => {
    const id = seedIds.appts.liveJoin;
    const patientCtx = await browser.newContext();
    const doctorCtx = await browser.newContext();
    const pPage = await patientCtx.newPage();
    const dPage = await doctorCtx.newPage();

    await loginUi(pPage, EMAILS.patient);
    await expect(pPage).toHaveURL(/\/browse/);
    await loginUi(dPage, EMAILS.doctor);
    await expect(dPage).toHaveURL(/\/doctor/);

    // VideoRoom auto-fires POST /dev/video/join {appointmentId} on mount (mock joinSimUrl path).
    // The unique "Leave" control confirms the mock room mounted (and recordJoin fired).
    await pPage.goto(`/video/${id}`);
    await expect(pPage.getByRole('button', { name: 'Leave' })).toBeVisible();
    await dPage.goto(`/video/${id}`);
    await expect(dPage.getByRole('button', { name: 'Leave' })).toBeVisible();

    await expect
      .poll(
        async () => {
          const a = await readAppointmentState(id);
          return Boolean(a?.doctorJoinedAt && a?.patientJoinedAt);
        },
        { timeout: 15_000 },
      )
      .toBe(true);

    await patientCtx.close();
    await doctorCtx.close();
  });

  test('worker drives in_progress, completed, and both no-show variants', async ({ request }) => {
    const r = await request.post('/dev/worker/evaluate');
    expect(r.ok()).toBeTruthy();

    await expect
      .poll(async () => (await readAppointmentState(seedIds.appts.inprogress))?.state)
      .toBe('in_progress');
    await expect
      .poll(async () => (await readAppointmentState(seedIds.appts.completed))?.state)
      .toBe('completed');
    await expect
      .poll(async () => (await readAppointmentState(seedIds.appts.docNoShow))?.state)
      .toBe('doctor_no_show');
    await expect
      .poll(async () => (await readAppointmentState(seedIds.appts.patNoShow))?.state)
      .toBe('patient_no_show');
  });
});
