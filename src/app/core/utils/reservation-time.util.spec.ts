import { isFutureReservationDateTime } from './reservation-time.util';

describe('isFutureReservationDateTime', () => {
  it('compares the selected wall time in the restaurant time zone', () => {
    const now = new Date('2026-01-15T11:00:00.000Z');

    expect(
      isFutureReservationDateTime('2026-01-15', '12:30', 'Europe/Rome', now),
    ).toBe(true);
    expect(
      isFutureReservationDateTime('2026-01-15', '11:30', 'Europe/Rome', now),
    ).toBe(false);
  });

  it('rejects invalid dates, times, and time zones', () => {
    const now = new Date('2026-01-15T11:00:00.000Z');

    expect(
      isFutureReservationDateTime('2026-02-31', '12:00', 'Europe/Rome', now),
    ).toBe(false);
    expect(
      isFutureReservationDateTime('2026-01-15', '25:00', 'Europe/Rome', now),
    ).toBe(false);
    expect(
      isFutureReservationDateTime('2026-01-15', '12:00', 'Invalid/Zone', now),
    ).toBe(false);
  });

  it('rejects a selected time that is already past within the current minute', () => {
    expect(
      isFutureReservationDateTime(
        '2026-01-15',
        '12:00',
        'Europe/Rome',
        new Date('2026-01-15T11:00:30.000Z'),
      ),
    ).toBe(false);
  });

  it('rejects wall times that do not exist during the spring DST transition', () => {
    expect(
      isFutureReservationDateTime(
        '2026-03-29',
        '02:30',
        'Europe/Rome',
        new Date('2026-03-28T12:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('uses the later Europe/Rome instant for an ambiguous autumn wall time', () => {
    expect(
      isFutureReservationDateTime(
        '2026-10-25',
        '02:30',
        'Europe/Rome',
        new Date('2026-10-25T01:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isFutureReservationDateTime(
        '2026-10-25',
        '02:30',
        'Europe/Rome',
        new Date('2026-10-25T01:30:00.000Z'),
      ),
    ).toBe(false);
  });
});
