/**
 * Wall-clock time in someone else's time zone.
 *
 * The assistant calls people where they are: a parent in Pune at half past
 * six, and the same family's son in London at seven in his evening. Every
 * calling-hours rule is written in the listener's local time and turned into
 * an instant here, with nothing but the platform's own Intl data, so summer
 * time in London or Toronto is handled the same way the person's phone does.
 */

export const INDIA = 'Asia/Kolkata';

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday. */
  weekday: number;
  /** YYYY-MM-DD */
  ymd: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** What a clock in `timeZone` shows at the instant `at`. */
export function localParts(at: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(at).map((p) => [p.type, p.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday),
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** The instant at which a clock in `timeZone` shows `hour:minute` on `ymd`. */
export function zonedInstant(ymd: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hour, minute);
  let guess = wanted;
  // Twice: the first pass finds the offset, the second settles a change of
  // offset (summer time) that the first guess straddled.
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), timeZone);
    guess += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Minutes since local midnight. */
export const hm = (hour: number, minute = 0) => hour * 60 + minute;

export interface CallingHours {
  /** Minutes since local midnight, inclusive. */
  from: number;
  /** Minutes since local midnight, exclusive. */
  to: number;
}

export function withinHours(at: Date, timeZone: string, hours: CallingHours): boolean {
  const p = localParts(at, timeZone);
  const minutes = hm(p.hour, p.minute);
  return minutes >= hours.from && minutes < hours.to;
}

/** `at` if it is inside calling hours, otherwise when they next open. */
export function nextCallingTime(at: Date, timeZone: string, hours: CallingHours): Date {
  if (withinHours(at, timeZone, hours)) return at;
  const p = localParts(at, timeZone);
  const today = zonedInstant(p.ymd, Math.floor(hours.from / 60), hours.from % 60, timeZone);
  return at < today ? today : zonedInstant(addDays(p.ymd, 1), Math.floor(hours.from / 60), hours.from % 60, timeZone);
}

/** "7:30 pm", as the listener would say it. */
export function spokenTime(at: Date, timeZone: string): string {
  return at
    .toLocaleTimeString('en-IN', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(':00', '')
    .toLowerCase();
}

/** "Tuesday, 14 November". */
export function spokenDate(at: Date, timeZone: string): string {
  return at.toLocaleDateString('en-IN', { timeZone, weekday: 'long', day: 'numeric', month: 'long' });
}

/** "London", from "Europe/London": how the time zone is shown to people. */
export function placeName(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ');
}
