/** Small formatting helpers, ported from the original page. */
import type { DaySnapshot } from '@heroarc/contracts';
import { shiftDate } from '@heroarc/domain';

/** Rounded with thousands separators, or an em dash. */
export const fmt = (n: number | null | undefined): string =>
  n == null ? '—' : Math.round(n).toLocaleString();

/** Minutes after midnight → "11:53 PM". */
export const clock = (m: number | null | undefined): string => {
  if (m == null) return '—';
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
};

export const shift = shiftDate;

/** Local noon on a 'YYYY-MM-DD' day (safe for toLocaleDateString). */
export const noon = (d: string): Date => new Date(`${d}T12:00`);

export const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions): string =>
  noon(d).toLocaleDateString(undefined, opts);

/** Client-generated event id (makes retries harmless), e.g. "w1abc2def". */
export const eventId = (prefix: string): string =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** "h:mm AM" for an instant, as the mood log shows it. */
export const clockTime = (d: Date): string =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Signed with a real minus sign: "+1.2", "−0.4". */
export const signed = (v: number, digits = 1): string =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

/** A day with no data yet (for optimistic writes to a day the snapshot doesn't have). */
export const emptyDay = (): DaySnapshot => ({
  sleep: null,
  readiness: null,
  sleepHours: null,
  hrv: null,
  rhr: null,
  bed: null,
  wake: null,
  stressMin: null,
  recoverMin: null,
  stressSummary: null,
  steps: null,
  activeKcal: null,
  totalKcal: null,
  weight: null,
  kcalIn: null,
  protein: null,
  carbs: null,
  fat: null,
});
