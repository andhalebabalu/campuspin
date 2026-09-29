import {
  bookingMoves,
  isoWeekday,
  istInstant,
  slotsFor,
  studentCanCancel,
} from './booking-rules.js';

const day = new Date('2026-10-05T00:00:00.000Z'); // a Monday
const early = new Date('2026-10-04T00:00:00.000Z');

describe('booking rules', () => {
  it('turns India times into instants', () => {
    expect(istInstant(day, 10 * 60).toISOString()).toBe('2026-10-05T04:30:00.000Z');
    expect(isoWeekday(day)).toBe(1);
    expect(isoWeekday(new Date('2026-10-11T00:00:00.000Z'))).toBe(7);
  });

  it('lays timed slots back to back within each window, ending by closing time', () => {
    const slots = slotsFor(
      day,
      [
        { openTime: '16:00', closeTime: '17:40' },
        { openTime: '10:00', closeTime: '11:00' },
      ],
      30,
      early,
    );
    expect(slots.map((slot) => slot.startAt.toISOString())).toEqual([
      '2026-10-05T04:30:00.000Z', // 10:00
      '2026-10-05T05:00:00.000Z', // 10:30
      '2026-10-05T10:30:00.000Z', // 16:00
      '2026-10-05T11:00:00.000Z', // 16:30
      '2026-10-05T11:30:00.000Z', // 17:00 (17:30 would end after 17:40)
    ]);
  });

  it('makes a whole day one slot, bookable until closing', () => {
    const slots = slotsFor(
      day,
      [
        { openTime: '08:00', closeTime: '13:00' },
        { openTime: '14:00', closeTime: '22:00' },
      ],
      null,
      early,
    );
    expect(slots).toHaveLength(1);
    expect(slots[0]?.startAt.toISOString()).toBe('2026-10-05T02:30:00.000Z');
    expect(slots[0]?.endAt.toISOString()).toBe('2026-10-05T16:30:00.000Z');
    const afternoon = new Date('2026-10-05T09:00:00.000Z');
    expect(
      slotsFor(day, [{ openTime: '08:00', closeTime: '22:00' }], null, afternoon),
    ).toHaveLength(1);
    expect(
      slotsFor(
        day,
        [{ openTime: '08:00', closeTime: '22:00' }],
        60,
        afternoon,
      )[0]?.startAt.toISOString(),
    ).toBe('2026-10-05T09:30:00.000Z');
  });

  it('allows only the business moves of each status and cancelling before the start', () => {
    expect(bookingMoves('PENDING')).toEqual(['CONFIRMED', 'CANCELLED']);
    expect(bookingMoves('COMPLETED')).toEqual([]);
    expect(studentCanCancel('CONFIRMED', istInstant(day, 600), early)).toBe(true);
    expect(
      studentCanCancel('CONFIRMED', istInstant(day, 600), new Date('2026-10-06T00:00:00Z')),
    ).toBe(false);
    expect(studentCanCancel('CANCELLED', istInstant(day, 600), early)).toBe(false);
  });
});
