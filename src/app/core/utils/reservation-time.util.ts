export function isFutureReservationDateTime(
  date: string,
  time: string,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return false;
  }

  const parsedDate = new Date(`${date}T${time}:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 16) !== `${date}T${time}`
  ) {
    return false;
  }

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const currentLocalDateTime =
      `${values['year']}-${values['month']}-${values['day']}T` +
      `${values['hour']}:${values['minute']}`;

    return `${date}T${time}` > currentLocalDateTime;
  } catch (error) {
    console.error('Invalid restaurant time zone:', timeZone, error);
    return false;
  }
}
