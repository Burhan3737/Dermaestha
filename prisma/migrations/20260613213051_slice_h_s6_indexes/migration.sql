-- CreateIndex
CREATE INDEX "appointments_slot_start_idx" ON "appointments"("slot_start");

-- CreateIndex
CREATE INDEX "audit_log_target_ref_idx" ON "audit_log"("target_ref");
