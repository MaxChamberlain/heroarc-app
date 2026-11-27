/*
 * Oura's daily data (API v2, /v2/usercollection/*) → one row per day for the dashboard.
 * Pure: the API fetches and stores. Field names are Oura's, as the original app used them:
 *   daily_sleep     { day, score }
 *   daily_readiness { day, score }
 *   daily_activity  { day, steps, active_calories, total_calories }
 *   sleep           { day, type: 'long_sleep' | …, total_sleep_duration (s), average_hrv,
 *                     lowest_heart_rate, bedtime_start, bedtime_end (local ISO with offset) }
 *   daily_stress    { day, stress_high (s), recovery_high (s), day_summary }
 */

export interface OuraCollections {
  daily_sleep: Array<{ day: string; score?: number | null }>;
  daily_readiness: Array<{ day: string; score?: number | null }>;
  daily_activity: Array<{
    day: string;
    steps?: number | null;
    active_calories?: number | null;
    total_calories?: number | null;
  }>;
  sleep: Array<{
    day: string;
    type?: string | null;
    total_sleep_duration?: number | null;
    average_hrv?: number | null;
    lowest_heart_rate?: number | null;
    bedtime_start?: string | null;
    bedtime_end?: string | null;
  }>;
  daily_stress: Array<{
    day: string;
    stress_high?: number | null;
    recovery_high?: number | null;
    day_summary?: string | null;
  }>;
}

/** The collections a sync reads (each needs the `daily` scope; daily_stress needs `stress`). */
export const OURA_COLLECTIONS = [
  'daily_sleep',
  'daily_readiness',
  'daily_activity',
  'sleep',
  'daily_stress',
] as const satisfies ReadonlyArray<keyof OuraCollections>;

export interface OuraDay {
  date: string;
  sleepScore: number | null;
  readiness: number | null;
  sleepHours: number | null;
  hrv: number | null;
  rhr: number | null;
  /** Minutes after local midnight (bedtime 23:40 → 1420; 00:30 → 30). */
  bedMin: number | null;
  wakeMin: number | null;
  stressMin: number | null;
  recoveryMin: number | null;
  stressSummary: string | null;
  steps: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
}

const num = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const int = (v: number | null | undefined): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

/** The local clock in an Oura timestamp ("2026-11-26T23:41:00-07:00" → 1421). */
export function ouraClockMinutes(iso: string | null | undefined): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** One row per day that has any data, oldest first. */
export function ouraDays(c: Partial<OuraCollections>): OuraDay[] {
  const days = new Map<string, OuraDay>();
  const get = (date: string): OuraDay => {
    let d = days.get(date);
    if (!d) {
      d = {
        date,
        sleepScore: null,
        readiness: null,
        sleepHours: null,
        hrv: null,
        rhr: null,
        bedMin: null,
        wakeMin: null,
        stressMin: null,
        recoveryMin: null,
        stressSummary: null,
        steps: null,
        activeKcal: null,
        totalKcal: null,
      };
      days.set(date, d);
    }
    return d;
  };
  const valid = (x: { day?: string }) =>
    typeof x.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.day);

  for (const x of (c.daily_sleep ?? []).filter(valid)) get(x.day).sleepScore = int(x.score);
  for (const x of (c.daily_readiness ?? []).filter(valid)) get(x.day).readiness = int(x.score);
  for (const x of (c.daily_activity ?? []).filter(valid)) {
    const d = get(x.day);
    d.steps = int(x.steps);
    d.activeKcal = int(x.active_calories);
    d.totalKcal = int(x.total_calories);
  }
  // The night's main sleep (the longest "long_sleep" if there are several), not naps.
  const main = new Map<string, OuraCollections['sleep'][number]>();
  for (const x of (c.sleep ?? []).filter(valid)) {
    if (x.type !== 'long_sleep') continue;
    const prev = main.get(x.day);
    if (!prev || (num(x.total_sleep_duration) ?? 0) > (num(prev.total_sleep_duration) ?? 0))
      main.set(x.day, x);
  }
  for (const [day, x] of main) {
    const d = get(day);
    const secs = num(x.total_sleep_duration);
    d.sleepHours = secs == null ? null : Math.round((secs / 3600) * 100) / 100;
    d.hrv = num(x.average_hrv);
    d.rhr = num(x.lowest_heart_rate);
    d.bedMin = ouraClockMinutes(x.bedtime_start);
    d.wakeMin = ouraClockMinutes(x.bedtime_end);
  }
  for (const x of (c.daily_stress ?? []).filter(valid)) {
    const d = get(x.day);
    const hi = num(x.stress_high);
    const rec = num(x.recovery_high);
    d.stressMin = hi == null ? null : Math.floor(hi / 60);
    d.recoveryMin = rec == null ? null : Math.floor(rec / 60);
    d.stressSummary = typeof x.day_summary === 'string' && x.day_summary ? x.day_summary : null;
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
