// @ts-check
// Pinned operational constants — source of truth: docs/engineering/CONFIG.md.
export const SLOT_LOCK_TTL_MIN = Number(process.env.SLOT_LOCK_TTL_MIN ?? 10);
export const SLOT_GRANULARITY_MIN = Number(process.env.SLOT_GRANULARITY_MIN ?? 30);
export const NO_SHOW_GRACE_MIN = Number(process.env.NO_SHOW_GRACE_MIN ?? 15);
export const VIDEO_TOKEN_PRE_MIN = Number(process.env.VIDEO_TOKEN_PRE_MIN ?? 10);
export const VIDEO_TOKEN_POST_MIN = Number(process.env.VIDEO_TOKEN_POST_MIN ?? 5);
export const RESET_TOKEN_TTL_MIN = Number(process.env.RESET_TOKEN_TTL_MIN ?? 60);
export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 7);

export const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
export const LOGIN_LOCKOUT_MIN = Number(process.env.LOGIN_LOCKOUT_MIN ?? 15);
export const SIGNUP_MAX_PER_IP_HOUR = Number(process.env.SIGNUP_MAX_PER_IP_HOUR ?? 5);
export const FORGOT_MAX_PER_ACCOUNT_HOUR = Number(process.env.FORGOT_MAX_PER_ACCOUNT_HOUR ?? 5);
export const PAYMENT_INTENT_MAX_PER_PATIENT_HOUR = Number(process.env.PAYMENT_INTENT_MAX_PER_PATIENT_HOUR ?? 10);

export const REFUND_MAX_ATTEMPTS = Number(process.env.REFUND_MAX_ATTEMPTS ?? 5);
export const REFUND_BACKOFF_BASE_SEC = Number(process.env.REFUND_BACKOFF_BASE_SEC ?? 30);

export const TIMEZONE = 'Asia/Karachi';

// States that occupy a slot (mirror the uniq_active_slot partial index). A slot with an
// appointment in any of these is NOT bookable / not regenerated as available.
export const ACTIVE_APPOINTMENT_STATES = [
  'slot_locked', 'confirmed', 'in_progress', 'completed', 'prescription_issued', 'cancelled_no_refund',
];
