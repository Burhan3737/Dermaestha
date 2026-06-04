-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "doctor_joined_at" TIMESTAMPTZ(6),
ADD COLUMN     "patient_joined_at" TIMESTAMPTZ(6);
