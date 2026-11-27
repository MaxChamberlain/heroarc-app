/** Calendar-day helpers. Days are 'YYYY-MM-DD' strings in the user's local timezone. */

/** Adds `n` days to a 'YYYY-MM-DD' date (DST-safe: works in UTC at noon). */
export function shiftDate(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The calendar day of `instant` in `timeZone`, as 'YYYY-MM-DD'. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** e.g. "7:15 PM" in `timeZone`. */
export function localClock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    instant,
  );
}

/** Short zone name at `instant`, e.g. "MST". */
export function zoneAbbrev(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(
    instant,
  );
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** The offset of `timeZone` from UTC at `instant`, in minutes (Denver in winter: -420). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The instant of a local day and clock ('YYYY-MM-DD', 'HH:MM[:SS]') in `timeZone`. In a DST gap
 * (a clock time that never happened) it lands just after; in an overlap, on the earlier one.
 */
export function zonedInstant(day: string, clock: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const [hh, mm, ss] = [...clock.split(':').map(Number), 0, 0] as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss || 0);
  const offAt = (t: number) => zoneOffsetMinutes(new Date(t), timeZone) * 60_000;
  // Two passes settle the offset across a DST change.
  const t1 = wall - offAt(wall);
  const t2 = wall - offAt(t1);
  // In a gap neither reads back as the wall clock; the first pass (old offset) lands just after.
  return new Date(t2 + offAt(t2) === wall ? t2 : t1);
}
