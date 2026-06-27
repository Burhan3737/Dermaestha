-- Manual payment pivot: collapse appointment states to 4, drop Payment + refund/no-show columns,
-- repoint notification types, add manual-payment columns + bank settings.

-- The partial unique index references AppointmentState literal values in its WHERE clause, so it
-- must be dropped before the enum is recreated and rebuilt afterward with the new state set.
DROP INDEX IF EXISTS "uniq_active_slot";

-- ── AppointmentState: recreate the enum, mapping any existing rows from the old values ──
ALTER TYPE "AppointmentState" RENAME TO "AppointmentState_old";
CREATE TYPE "AppointmentState" AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');
ALTER TABLE "appointments" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "appointments"
  ALTER COLUMN "state" TYPE "AppointmentState"
  USING (CASE "state"::text
    WHEN 'slot_locked' THEN 'pending'
    WHEN 'in_progress' THEN 'confirmed'
    WHEN 'prescription_issued' THEN 'completed'
    WHEN 'cancelled_refunded' THEN 'cancelled'
    WHEN 'cancelled_no_refund' THEN 'cancelled'
    WHEN 'doctor_cancelled' THEN 'cancelled'
    WHEN 'patient_no_show' THEN 'cancelled'
    WHEN 'doctor_no_show' THEN 'cancelled'
    ELSE "state"::text END)::"AppointmentState";
ALTER TABLE "appointments" ALTER COLUMN "state" SET DEFAULT 'pending';
DROP TYPE "AppointmentState_old";

-- ── NotificationType: recreate, mapping cancellation_apology → cancellation ──
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM ('booking_confirmation', 'reminder_24h', 'reminder_1h', 'prescription_ready', 'payment_submitted_admin', 'payment_not_received', 'cancellation');
ALTER TABLE "notification_jobs"
  ALTER COLUMN "type" TYPE "NotificationType"
  USING (CASE "type"::text
    WHEN 'cancellation_apology' THEN 'cancellation'
    ELSE "type"::text END)::"NotificationType";
DROP TYPE "NotificationType_old";

-- ── Appointment columns ──
ALTER TABLE "appointments"
  ADD COLUMN "payment_reference" TEXT,
  ADD COLUMN "payment_submitted_at" TIMESTAMPTZ(6),
  DROP COLUMN "doctor_joined_at",
  DROP COLUMN "patient_joined_at",
  DROP COLUMN "disputed",
  DROP COLUMN "lock_expires_at";

-- ── Settings: add bank fields, drop fallback-fee columns ──
ALTER TABLE "settings"
  ADD COLUMN "bank_name" TEXT,
  ADD COLUMN "bank_account_name" TEXT,
  ADD COLUMN "bank_account_number" TEXT,
  ADD COLUMN "bank_instructions" TEXT,
  DROP COLUMN "fallback_fee_pct_bps",
  DROP COLUMN "fallback_fee_fixed";

-- ── Drop the Payment table + its enums ──
DROP TABLE IF EXISTS "payments";
DROP TYPE IF EXISTS "PaymentStatus";
DROP TYPE IF EXISTS "RefundStatus";

-- ── Recreate the NO-DOUBLE-BOOKING partial index for the new state set ──
CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
  WHERE state IN ('pending', 'confirmed', 'completed');
