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

export const stateLabel = (state) => LABELS[state] ?? state;
