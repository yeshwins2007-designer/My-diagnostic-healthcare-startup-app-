/**
 * "Where is the person who is coming?"
 *
 * Answered from the technician's own location pings, never guessed. A
 * minute figure is given only when this visit is the technician's next stop
 * and their phone has reported in the last ten minutes; otherwise the answer
 * is the promised window and how many visits come first, which is still true
 * and still calming.
 */

import { db } from '../db';
import { estimateMinutes, haversineKm } from '../geo';
import { INDIA, spokenTime } from './time';
import { firstName } from './scripts';

const FRESH_PING_MINUTES = 10;

export type EtaState = 'NOT_TODAY' | 'NOT_STARTED' | 'VISITS_FIRST' | 'ON_THE_WAY' | 'NO_SIGNAL' | 'AT_THE_DOOR' | 'DONE';

export interface Eta {
  state: EtaState;
  technician: string;
  windowStart: Date;
  windowEnd: Date;
  /** Rounded up to five, and only when state is ON_THE_WAY. */
  minutes?: number;
  visitsBefore?: number;
  /** True when the projected arrival is inside the promised window. */
  insideWindow?: boolean;
}

const roundUp5 = (m: number) => Math.max(5, Math.ceil(m / 5) * 5);

export async function technicianEta(bookingId: string, now = new Date()): Promise<Eta | null> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { address: true, technician: { include: { user: true } }, route: { include: { bookings: true } } },
  });
  if (!booking) return null;
  const base = {
    technician: booking.technician ? firstName(booking.technician.user.name) : 'Your technician',
    windowStart: booking.windowStart,
    windowEnd: booking.windowEnd,
  };

  if (['ARRIVED'].includes(booking.status)) return { ...base, state: 'AT_THE_DOOR' };
  if (['COLLECTED', 'IN_TRANSIT', 'AT_LAB', 'PROCESSING', 'REPORTED', 'CLOSED'].includes(booking.status)) {
    return { ...base, state: 'DONE' };
  }
  const sameDay = booking.windowStart.toLocaleDateString('en-CA', { timeZone: INDIA }) === now.toLocaleDateString('en-CA', { timeZone: INDIA });
  if (!sameDay || !['SCHEDULED', 'EN_ROUTE'].includes(booking.status)) return { ...base, state: 'NOT_TODAY' };

  const route = booking.route;
  if (!route || route.status !== 'STARTED') return { ...base, state: 'NOT_STARTED' };

  const ahead = route.bookings.filter(
    (b) => b.id !== booking.id && ['SCHEDULED', 'EN_ROUTE', 'ARRIVED'].includes(b.status) && b.windowStart < booking.windowStart,
  );
  if (ahead.length > 0) return { ...base, state: 'VISITS_FIRST', visitsBefore: ahead.length };

  const ping = await db.locationPing.findFirst({ where: { routeId: route.id }, orderBy: { recordedAt: 'desc' } });
  if (!ping || now.getTime() - ping.recordedAt.getTime() > FRESH_PING_MINUTES * 60_000) {
    return { ...base, state: 'NO_SIGNAL' };
  }
  const km = haversineKm(
    { lat: ping.latitude, lng: ping.longitude },
    { lat: booking.address.latitude, lng: booking.address.longitude },
  );
  const minutes = roundUp5(estimateMinutes(km));
  return {
    ...base,
    state: 'ON_THE_WAY',
    minutes,
    insideWindow: now.getTime() + minutes * 60_000 <= booking.windowEnd.getTime(),
  };
}

/** The answer, in the words the assistant says. */
export function describeEta(eta: Eta): string {
  const window = `between ${spokenTime(eta.windowStart, INDIA)} and ${spokenTime(eta.windowEnd, INDIA)}`;
  switch (eta.state) {
    case 'ON_THE_WAY':
      return eta.insideWindow
        ? `${eta.technician} is about ${eta.minutes} minutes away, inside your window ${window}.`
        : `${eta.technician} is about ${eta.minutes} minutes away. That is later than your window ${window}, and I'm sorry. A coordinator will call you.`;
    case 'VISITS_FIRST':
      return `${eta.technician} is on the route and has ${eta.visitsBefore === 1 ? 'one visit' : `${eta.visitsBefore} visits`} before yours. Your window is ${window}.`;
    case 'NO_SIGNAL':
      return `${eta.technician} is on the way, but I can't see their location this minute. Your window is ${window}. If it helps, I'll ask a coordinator to call you.`;
    case 'NOT_STARTED':
      return `${eta.technician} hasn't set out yet. Your visit is today, ${window}.`;
    case 'AT_THE_DOOR':
      return `${eta.technician} has arrived at the door.`;
    case 'DONE':
      return `${eta.technician} has already been, and the sample is on its way to the laboratory.`;
    case 'NOT_TODAY':
      return `There's no visit today. The next one is on ${eta.windowStart.toLocaleDateString('en-IN', { timeZone: INDIA, weekday: 'long', day: 'numeric', month: 'long' })}, ${window}.`;
  }
}
