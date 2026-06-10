// @ts-check
import { fromZonedTime } from 'date-fns-tz';

export const KARACHI = 'Asia/Karachi';

/**
 * Convert a Karachi wall time (date + "HH:mm") to a UTC Date instant.
 * @param {string} dateYMD "YYYY-MM-DD" @param {string} hhmm "HH:mm"
 */
export function karachiWallTimeToUtc(dateYMD, hhmm) {
  return fromZonedTime(`${dateYMD}T${hhmm}:00`, KARACHI);
}

/** Weekday (0=Sun..6=Sat) of a Karachi calendar date. Noon avoids any edge ambiguity. */
export function karachiWeekday(dateYMD) {
  return new Date(`${dateYMD}T12:00:00+05:00`).getUTCDay();
}
