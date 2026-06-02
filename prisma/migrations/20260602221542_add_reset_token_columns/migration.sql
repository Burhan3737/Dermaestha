-- AlterTable
ALTER TABLE "users" ADD COLUMN     "reset_token_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "reset_token_hash" TEXT;
