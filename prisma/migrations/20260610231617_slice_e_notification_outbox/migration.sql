-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('booking_confirmation', 'reminder_24h', 'reminder_1h', 'prescription_ready', 'refund_confirmation', 'cancellation_apology', 'refund_delayed');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'suppressed');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "next_refund_retry_at" TIMESTAMPTZ(6),
ADD COLUMN     "refund_attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "vars" JSONB,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_jobs_status_scheduled_for_idx" ON "notification_jobs"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "notification_jobs_appointment_id_type_key" ON "notification_jobs"("appointment_id", "type");

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
