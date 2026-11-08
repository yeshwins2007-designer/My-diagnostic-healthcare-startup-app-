/**
 * Who can book: Medwyn One members, anything; anyone else, only at a lab they
 * chose themselves; otherwise, join first.
 */
import { describe, expect, it } from 'vitest';
import { bookingAccess } from '@/lib/booking-access';

describe('booking access', () => {
  it('lets a member book, whatever lab the family has or has not chosen', () => {
    expect(bookingAccess({ isMember: true, chosenLabId: null })).toEqual({ mode: 'MEMBER' });
    expect(bookingAccess({ isMember: true, chosenLabId: 'lab_1' })).toEqual({ mode: 'MEMBER' });
  });

  it('lets a non-member book only at the lab they chose, at its own prices', () => {
    expect(bookingAccess({ isMember: false, chosenLabId: 'lab_1' })).toEqual({ mode: 'CHOSEN_LAB', labId: 'lab_1' });
  });

  it('asks everyone else to join Medwyn One', () => {
    expect(bookingAccess({ isMember: false, chosenLabId: null })).toEqual({ mode: 'NEEDS_MEMBERSHIP' });
    expect(bookingAccess({ isMember: false, chosenLabId: undefined })).toEqual({ mode: 'NEEDS_MEMBERSHIP' });
  });
});
