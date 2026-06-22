// @ts-check
/** Patient-facing terminal-state labels — F08.01's exact mapping. State stays source of truth. */
const LABELS = {
  completed: 'Completed',
  prescription_issued: 'Completed',
  patient_no_show: 'Missed (no-show)',
  doctor_no_show: 'Cancelled by doctor — refund issued',
  doctor_cancelled: 'Cancelled by doctor — refund issued',
  cancelled_refunded: 'Cancelled — refunded',
  cancelled_no_refund: 'Cancelled — no refund',
};

/** Active (non-terminal) state labels — used as a fallback so the same helper labels every row. */
const ACTIVE_LABELS = {
  confirmed: 'Confirmed',
  in_progress: 'In progress',
  slot_locked: 'Payment pending',
};

export const stateLabel = (state) => LABELS[state] ?? ACTIVE_LABELS[state] ?? state;

/** Status → `.badge--*` variant (doc 06 §3 "Appointment state → badge mapping"). */
const VARIANT = {
  confirmed: 'success',
  in_progress: 'info',
  completed: 'success',
  prescription_issued: 'success',
  patient_no_show: 'warning',
  doctor_no_show: 'danger',
  doctor_cancelled: 'danger',
  cancelled_refunded: 'info',
  cancelled_no_refund: 'neutral',
  slot_locked: 'warning',
};

export const stateBadge = (state) => VARIANT[state] ?? 'neutral';
