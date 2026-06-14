import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const { prisma } = await import('#src/lib/prisma/prisma.js');
const { paymentProvider } = await import('#src/integrations/payment/index.js');
const appointmentState = await import('#src/modules/appointment/service.js');
const { reconcileUnconfirmed } = await import('#src/modules/payment/service.js');
const { SLOT_GRANULARITY_MIN } = await import('#src/config/constants.js');

const uniq = (p) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

// FIX B (Slice H): edge #6a refundInFull must NOT delete the payment-referenced appointment.
// The path sets the Payment to `success` (refunded), so deleting the slot_locked appointment it
// FK-references (Payment.appointment is ON DELETE RESTRICT, no cascade) raised a latent P2003.
// The fix force-expires the lock (a plain update, no FK touched) and preserves both records.
describe('FIX B reconcile refundInFull (edge #6a): no P2003, records preserved', () => {
  let doctorId;
  let docUserId;
  let patientUserId;

  beforeAll(async () => {
    const du = await prisma.user.create({
      data: { role: 'doctor', email: uniq('fixBdoc'), passwordHash: 'x', fullName: 'Dr FixB' },
    });
    docUserId = du.id;
    const d = await prisma.doctor.create({
      data: {
        userId: du.id,
        pmcNumber: `PMC-FB-${Date.now()}`,
        specialization: 'Derm',
        fee: 250000,
        isActive: true,
        status: 'active',
      },
    });
    doctorId = d.id;
    const pu = await prisma.user.create({
      data: {
        role: 'patient',
        email: uniq('fixBpat'),
        passwordHash: 'x',
        fullName: 'Paid Patient',
      },
    });
    patientUserId = pu.id;
  });

  afterAll(async () => {
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.user.deleteMany({ where: { id: { in: [docUserId, patientUserId] } } });
    await prisma.$disconnect();
  });

  it('paid at gateway but slot gone → full refund settles, no crash, appointment + payment kept, lock released', async () => {
    // A paid-but-lost-IPN booking still held as a (future-locked) slot_locked appointment.
    const slotStart = new Date(Date.now() + 3 * 86400000);
    const appt = await prisma.appointment.create({
      data: {
        doctorId,
        patientUserId,
        slotStart,
        slotEnd: new Date(slotStart.getTime() + SLOT_GRANULARITY_MIN * 60 * 1000),
        state: 'slot_locked',
        lockExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // still-live lock → proves force-expiry
        forSelf: true,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        appointmentId: appt.id,
        patientUserId,
        slotStart,
        amount: 250000,
        status: 'pending',
        providerRef: `pr_${Date.now()}`,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // aged into the reconciliation window
      },
    });

    // Gateway says PAID; the confirm transition fails (slot was claimed by a confirmed appointment
    // while we held this stale lock — the documented #6a trigger; unreproducible in pure DB because
    // the uniq_active_slot partial index forbids a confirmed + slot_locked row coexisting at a slot).
    const qspy = vi
      .spyOn(paymentProvider, 'queryPaymentStatus')
      .mockResolvedValue({ status: 'paid', amount: 250000 });
    const tspy = vi
      .spyOn(appointmentState, 'transition')
      .mockRejectedValue(Object.assign(new Error('unique constraint'), { code: 'P2002' }));
    const rspy = vi
      .spyOn(paymentProvider, 'refund')
      .mockResolvedValue({ refundRef: 'rf_test', status: 'settled' });

    await expect(reconcileUnconfirmed(new Date())).resolves.toBeUndefined(); // no throw / no 500

    qspy.mockRestore();
    tspy.mockRestore();
    rspy.mockRestore();

    // FULL gross refund settled on the preserved Payment record.
    const afterPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterPayment).not.toBeNull();
    expect(afterPayment.status).toBe('success'); // money WAS captured at the gateway
    expect(afterPayment.refundStatus).toBe('settled');
    expect(afterPayment.refundRef).toBe('rf_test');

    // The appointment record is PRESERVED (no FK-crashing delete) and its lock no longer blocks.
    const afterAppt = await prisma.appointment.findUnique({ where: { id: appt.id } });
    expect(afterAppt).not.toBeNull();
    expect(afterAppt.lockExpiresAt.getTime()).toBeLessThanOrEqual(Date.now()); // force-expired

    // refundInFull completed cleanly — the audited refund, not a swallowed reconciliation crash.
    const refundAudit = await prisma.auditLog.findFirst({
      where: { eventType: 'payment.reconciliation_refund', targetRef: appt.id },
    });
    expect(refundAudit).not.toBeNull();
    const mismatch = await prisma.auditLog.findFirst({
      where: { eventType: 'payment.reconciliation_mismatch', targetRef: appt.id },
    });
    expect(mismatch).toBeNull();

    await prisma.payment.deleteMany({ where: { appointmentId: appt.id } });
    await prisma.appointment.deleteMany({ where: { id: appt.id } });
    await prisma.auditLog.deleteMany({ where: { targetRef: appt.id } });
  });
});
