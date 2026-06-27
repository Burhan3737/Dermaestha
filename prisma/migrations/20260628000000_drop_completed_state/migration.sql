-- Drop the `completed` appointment state: collapse the state machine to {pending, confirmed,
-- cancelled}. Prescriptions are now gated on `confirmed` (no time-based completion), so existing
-- `completed` rows map → `confirmed`. Postgres cannot drop an enum value in place, so the type is
-- recreated. The partial unique index references the enum literals in its WHERE clause, so it must
-- be dropped before the enum is recreated and rebuilt afterward with the new state set.

DROP INDEX IF EXISTS "uniq_active_slot";

-- ── AppointmentState: recreate the enum, mapping existing `completed` rows → `confirmed` ──
ALTER TYPE "AppointmentState" RENAME TO "AppointmentState_old";
CREATE TYPE "AppointmentState" AS ENUM ('pending', 'confirmed', 'cancelled');
ALTER TABLE "appointments" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "appointments"
  ALTER COLUMN "state" TYPE "AppointmentState"
  USING (CASE "state"::text
    WHEN 'completed' THEN 'confirmed'
    ELSE "state"::text END)::"AppointmentState";
ALTER TABLE "appointments" ALTER COLUMN "state" SET DEFAULT 'pending';
DROP TYPE "AppointmentState_old";

-- ── Recreate the NO-DOUBLE-BOOKING partial index for the new state set (cancelled excluded) ──
CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
  WHERE state IN ('pending', 'confirmed');
