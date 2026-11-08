/**
 * Clock and calendar for the partner portal, in India Standard Time.
 *
 * Servers run in UTC. A lab in Bengaluru closes its day at midnight IST, so
 * "today's earnings" and "decide by 14:32" must be IST, not whatever zone
 * the server happens to be in. IST has no daylight saving, so +05:30 holds.
 */

const ZONE = 'Asia/Kolkata';

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('en-IN', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
const dayFormat = new Intl.DateTimeFormat('en-IN', { timeZone: ZONE, weekday: 'short', day: 'numeric', month: 'short' });
const shortDayFormat = new Intl.DateTimeFormat('en-IN', { timeZone: ZONE, day: 'numeric', month: 'short' });

/** "2026-10-13": the IST calendar day a moment falls on. */
export function istDayKey(at: Date): string {
  return dayKeyFormat.format(at);
}

/** Midnight IST at the start of the day `at` falls on, `offsetDays` later. */
export function istStartOfDay(at: Date, offsetDays = 0): Date {
  const start = new Date(`${istDayKey(at)}T00:00:00+05:30`);
  return new Date(start.getTime() + offsetDays * 86_400_000);
}

/** "14:32" */
export function istTime(at: Date): string {
  return timeFormat.format(at);
}

/** "Tue, 13 Oct" */
export function istDay(at: Date): string {
  return dayFormat.format(at);
}

/** "13 Oct" */
export function istShortDay(at: Date): string {
  return shortDayFormat.format(at);
}

/** "Today", "Tomorrow" or "Tue, 13 Oct", relative to `now`. */
export function istRelativeDay(at: Date, now = new Date()): string {
  const key = istDayKey(at);
  if (key === istDayKey(now)) return 'Today';
  if (key === istDayKey(istStartOfDay(now, 1))) return 'Tomorrow';
  return istDay(at);
}
