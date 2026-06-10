// @ts-check
import crypto from 'node:crypto';

/** 32 random bytes as hex — the raw token sent in the email link (never stored). */
export const generateResetToken = () => crypto.randomBytes(32).toString('hex');

/** SHA-256 hex of the raw token — this is what we persist and compare. */
export const hashResetToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
