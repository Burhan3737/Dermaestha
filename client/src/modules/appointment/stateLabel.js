// @ts-check
/**
 * Patient/doctor-facing labels for the 3-state manual-payment model
 * (`pending → confirmed`, plus `cancelled`). State stays the source of truth.
 */
const LABELS = {
  pending: 'Payment pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

export const stateLabel = (state) => LABELS[state] ?? state;

/** Status → `.badge--*` variant (doc 06 §3 "Appointment state → badge mapping"). */
const VARIANT = {
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'neutral',
};

export const stateBadge = (state) => VARIANT[state] ?? 'neutral';
