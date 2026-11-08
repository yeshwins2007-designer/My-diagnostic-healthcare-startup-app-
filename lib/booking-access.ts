/**
 * Who can book, and on what terms.
 *
 * Booking is a Medwyn One service: members book any visit, for anyone in the
 * family, at member prices. The one way in without a membership is a lab the
 * family chose themselves (searched for on the home screen, or picked in
 * Profile): that lab's own prices, per test, plus the collection charge.
 * Without either, booking asks them to join, and says where the lab search
 * is, so the second door is never hidden.
 *
 * The same rule runs on the booking page (what is shown) and in the booking
 * action (what is accepted), so a hand-made request gets the same answer.
 */

export type BookingAccess =
  | { mode: 'MEMBER' }
  | { mode: 'CHOSEN_LAB'; labId: string }
  | { mode: 'NEEDS_MEMBERSHIP' };

export function bookingAccess(input: { isMember: boolean; chosenLabId: string | null | undefined }): BookingAccess {
  if (input.isMember) return { mode: 'MEMBER' };
  if (input.chosenLabId) return { mode: 'CHOSEN_LAB', labId: input.chosenLabId };
  return { mode: 'NEEDS_MEMBERSHIP' };
}

export const NEEDS_MEMBERSHIP = {
  reason: 'Booking a home visit is part of Medwyn One.',
  remedy: 'Join Medwyn One, or search for a particular lab on the home screen and book it at that lab’s own prices.',
};

export function chosenLabUnavailable(labName: string) {
  return {
    reason: `${labName} can’t take this booking right now.`,
    remedy: 'Choose another lab from the home screen search, or join Medwyn One and we arrange the lab for you.',
  };
}
