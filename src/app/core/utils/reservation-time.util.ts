export function isFutureReservationDateTime(
  date: string,
  time: string,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return false;
  }

  const localDateTime = `${date}T${time}:00`;
  const parsedDate = new Date(`${localDateTime}.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 16) !== `${date}T${time}`
  ) {
    return false;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const localDateTimeKey = `${localDateTime}`;
    const wallTimeAsUtc = parsedDate.getTime();
    const offsets = new Set<number>();

    for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
      const probe = new Date(wallTimeAsUtc + hours * 60 * 60 * 1000);
      const parts = formatter.formatToParts(probe);
      const values = Object.fromEntries(
        parts.map(({ type, value }) => [type, value]),
      );
      const formattedAsUtc = Date.UTC(
        Number(values['year']),
        Number(values['month']) - 1,
        Number(values['day']),
        Number(values['hour']),
        Number(values['minute']),
        Number(values['second']),
      );
      offsets.add(
        (formattedAsUtc - Math.floor(probe.getTime() / 1000) * 1000) / 60_000,
      );
    }

    const matchingInstants = [...offsets]
      .map((offset) => wallTimeAsUtc - offset * 60_000)
      .filter((instant) => {
        const parts = formatter.formatToParts(new Date(instant));
        const values = Object.fromEntries(
          parts.map(({ type, value }) => [type, value]),
        );
        return (
          `${values['year']}-${values['month']}-${values['day']}T` +
            `${values['hour']}:${values['minute']}:${values['second']}` ===
          localDateTimeKey
        );
      });

    if (matchingInstants.length === 0) {
      return false;
    }

    return Math.max(...matchingInstants) > now.getTime();
  } catch (error) {
    console.error('Invalid restaurant time zone:', timeZone, error);
    return false;
  }
}
