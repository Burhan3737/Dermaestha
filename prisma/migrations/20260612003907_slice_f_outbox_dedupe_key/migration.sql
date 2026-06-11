-- AlterTable: add dedupe_key; default '' preserves Slice E singleton semantics for existing rows.
ALTER TABLE "notification_jobs" ADD COLUMN "dedupe_key" TEXT NOT NULL DEFAULT '';

-- DropIndex: remove the old 2-column unique constraint.
DROP INDEX "notification_jobs_appointment_id_type_key";

-- CreateIndex: replace with the 3-column composite unique constraint.
CREATE UNIQUE INDEX "notification_jobs_appointment_id_type_dedupe_key_key" ON "notification_jobs"("appointment_id", "type", "dedupe_key");
