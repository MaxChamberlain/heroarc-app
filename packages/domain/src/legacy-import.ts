/*
 * Reading the original HeroArc's Google Sheet ("HeroArc Health Log", downloaded as .xlsx) into
 * new records. Pure: the API reads the file and writes the results.
 *
 * Tabs and columns (from the original setup_sheet.py):
 *   Settings       B1 kcal goal · B2 protein goal · B3 steps goal · B4 active kcal goal · B7 "set"
 *   Nutrition Log  Date · Time · Meal · Items · Calories · Protein · Carbs · Fat · Confidence · Source · Notes
 *   Weight Log     Date · Weight (lb) · (7-day avg, change: formulas, ignored)
 *   Training Log   Date · Workout · Status · Lift · Direction · Max (lb) · Notes · Logged at · Event id · Reps
 *                  (one status row plus one row per lift for each logged event)
 *   Plan           Workout · Exercise · Sets · Key lift (x) · Order
 *   Habits         Habit · Id · Archive (x to hide)
 *   Habit Log      Date · Habit id · Done · Logged at · Event id
 *   Mood Log       Date · Time · Mood (1-5) · Note · Logged at · Event id
 * The Oura tab is not imported: Oura history comes from Oura once it's connected.
 *
 * Cells arrive as the spreadsheet stores them: dates and times as day serials (days since
 * 1899-12-30, times as the fraction), or as text when typed in. Every imported entry gets a
 * stable key ("legacy:…"), so importing the same sheet again adds only what's new.
 */

export type LegacyCell = string | number | boolean | null;
export type LegacyRows = LegacyCell[][];
/** Tab name → rows, header row first. */
export type LegacyWorkbook = Record<string, LegacyRows>;

export const LEGACY_TABS = [
  'Settings',
  'Nutrition Log',
  'Weight Log',
  'Training Log',
  'Plan',
  'Habits',
  'Habit Log',
  'Mood Log',
] as const;
export type LegacyTab = (typeof LEGACY_TABS)[number];

/** A local moment: a day and a 24-hour clock (HH:MM:SS). */
export interface LocalStamp {
  date: string;
  time: string;
}

export interface LegacyMeal {
  key: string;
  date: string;
  time: string | null;
  meal: string;
  items: string;
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  confidence: string | null;
  source: string | null;
  notes: string | null;
}

export interface LegacyWeight {
  key: string;
  date: string;
  lb: number;
}

export interface LegacySession {
  key: string;
  date: string;
  workout: string | null;
  status: 'done' | 'partial' | 'rest';
  lifts: Record<
    string,
    { dir: 'up' | 'same' | 'down' | null; wt: number | null; reps: number | null }
  >;
  loggedAt: LocalStamp;
}

export interface LegacyPlanWorkout {
  name: string;
  ex: Array<{ n: string; sets: string; star: 0 | 1 }>;
}

export interface LegacyHabit {
  id: string;
  name: string;
  archived: boolean;
  position: number;
}

export interface LegacyHabitCheck {
  date: string;
  habitId: string;
  done: boolean;
}

export interface LegacyMood {
  key: string;
  date: string;
  mood: number;
  note: string;
  loggedAt: LocalStamp;
}

export interface LegacyGoals {
  kcal: number | null;
  protein: number | null;
  steps: number | null;
  activeKcal: number | null;
  /** The user had saved goals themselves ("set" in B7). */
  goalsSet: boolean;
}

export interface LegacyTabReport {
  tab: LegacyTab;
  /** Data rows found (blank rows not counted). */
  rows: number;
  /** Entries read from them (several Training Log rows make one session). */
  entries: number;
  skipped: number;
  from: string | null;
  to: string | null;
  /** The first few rows that couldn't be read, and why. */
  problems: string[];
}

export interface LegacyImport {
  goals: LegacyGoals | null;
  meals: LegacyMeal[];
  weights: LegacyWeight[];
  sessions: LegacySession[];
  plan: LegacyPlanWorkout[] | null;
  habits: LegacyHabit[];
  habitChecks: LegacyHabitCheck[];
  moods: LegacyMood[];
  report: LegacyTabReport[];
  /** Tabs of the original sheet that were found (at least one is needed). */
  found: LegacyTab[];
}

/* ------------------------------------------------------------------------------------------ */
/* Cells                                                                                       */

const EPOCH = Date.UTC(1899, 11, 30);
const pad = (n: number) => String(n).padStart(2, '0');

const isBlank = (v: LegacyCell | undefined) =>
  v == null || (typeof v === 'string' && v.trim() === '');

const text = (v: LegacyCell | undefined, max = 300): string =>
  isBlank(v) ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max);

/** A number, also from text ("450", "12.5"). */
export function legacyNumber(v: LegacyCell | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isValidDay(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return (
    t.getUTCFullYear() === y &&
    t.getUTCMonth() === m - 1 &&
    t.getUTCDate() === d &&
    y >= 2000 &&
    y <= 2100
  );
}

/** A day as YYYY-MM-DD: from a day serial, "2026-03-04", or "3/4/2026" (US order, as Sheets shows it). */
export function legacyDate(v: LegacyCell | undefined): string | null {
  if (typeof v === 'number' && v > 36_000 && v < 80_000) {
    const t = new Date(EPOCH + Math.floor(v) * 86_400_000);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
}

/** A 24-hour clock HH:MM:SS: from a time serial (the fraction of a day) or "7:05 PM" / "19:05". */
export function legacyTime(v: LegacyCell | undefined): string | null {
  if (typeof v === 'number' && v >= 0) {
    const secs = Math.round((v - Math.floor(v)) * 86_400) % 86_400;
    return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  }
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(v.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] ?? 0);
  const ampm = m[4]?.toLowerCase().replace(/\./g, '');
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59 || sec > 59) return null;
  return `${pad(h)}:${pad(min)}:${pad(sec)}`;
}

/** "Logged at": "2026-03-04 19:05:12" (local), or a day-and-time serial. */
export function legacyStamp(v: LegacyCell | undefined): LocalStamp | null {
  if (typeof v === 'number' && v > 36_000) {
    const date = legacyDate(v);
    const time = legacyTime(v);
    return date && time ? { date, time } : null;
  }
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2})?)/.exec(v.trim());
  if (!m) return null;
  const date = legacyDate(m[1] as string);
  const time = legacyTime(m[2] as string);
  return date && time ? { date, time } : null;
}

/** A short, stable fingerprint of some values (FNV-1a, two seeds → 16 hex characters). */
function fingerprint(parts: unknown[]): string {
  const s = JSON.stringify(parts);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Keys from content, numbered when the same content repeats (two identical weigh-ins stay two). */
function contentKeys(prefix: string) {
  const seen = new Map<string, number>();
  return (parts: unknown[]) => {
    const f = fingerprint(parts);
    const n = (seen.get(f) ?? 0) + 1;
    seen.set(f, n);
    return `legacy:${prefix}:${f}${n > 1 ? `:${n}` : ''}`;
  };
}

const eventKey = (prefix: string, id: string) =>
  `legacy:${prefix}:${id.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 60)}`;

/* ------------------------------------------------------------------------------------------ */
/* Tabs                                                                                        */

function newReport(tab: LegacyTab): LegacyTabReport {
  return { tab, rows: 0, entries: 0, skipped: 0, from: null, to: null, problems: [] };
}

function span(r: LegacyTabReport, date: string) {
  if (!r.from || date < r.from) r.from = date;
  if (!r.to || date > r.to) r.to = date;
}

function skip(r: LegacyTabReport, row: number, why: string) {
  r.skipped++;
  if (r.problems.length < 5) r.problems.push(`Row ${row}: ${why}`);
}

/** Data rows (after the header) with their sheet row number, skipping blank ones. */
function dataRows(rows: LegacyRows | undefined, width: number) {
  return (rows ?? [])
    .slice(1)
    .map((cells, i) => ({
      cells: Array.from({ length: width }, (_, c) => cells[c] ?? null),
      n: i + 2,
    }))
    .filter(({ cells }) => !cells.every(isBlank));
}

function readMeals(rows: LegacyRows | undefined, r: LegacyTabReport): LegacyMeal[] {
  const key = contentKeys('meal');
  const out: LegacyMeal[] = [];
  for (const { cells, n } of dataRows(rows, 11)) {
    r.rows++;
    const [d, t, meal, items, kcal, p, c, f, conf, src, notes] = cells;
    const date = legacyDate(d);
    const k = legacyNumber(kcal);
    if (!date) {
      skip(r, n, 'no date');
      continue;
    }
    if (k == null || k < 0 || k > 10_000) {
      skip(r, n, 'no calories');
      continue;
    }
    const time = legacyTime(t);
    const m: LegacyMeal = {
      key: '',
      date,
      time: time ? time.slice(0, 5) : null,
      meal: text(meal, 40) || 'Snack',
      items: text(items) || 'Meal',
      kcal: k,
      protein: Math.max(0, legacyNumber(p) ?? 0),
      carbs: legacyNumber(c),
      fat: legacyNumber(f),
      confidence: text(conf, 20) || null,
      source: text(src, 60) || null,
      notes: text(notes) || null,
    };
    m.key = key([m.date, m.time, m.meal, m.items, m.kcal, m.protein, m.carbs, m.fat]);
    out.push(m);
    r.entries++;
    span(r, date);
  }
  return out;
}

function readWeights(rows: LegacyRows | undefined, r: LegacyTabReport): LegacyWeight[] {
  const key = contentKeys('weight');
  const out: LegacyWeight[] = [];
  for (const { cells, n } of dataRows(rows, 2)) {
    r.rows++;
    const date = legacyDate(cells[0]);
    const lb = legacyNumber(cells[1]);
    if (!date) {
      skip(r, n, 'no date');
      continue;
    }
    if (lb == null || lb < 50 || lb > 700) {
      skip(r, n, 'no weight');
      continue;
    }
    out.push({ key: key([date, lb]), date, lb });
    r.entries++;
    span(r, date);
  }
  return out;
}

const STATUSES = ['done', 'partial', 'rest'] as const;
const DIRS = ['up', 'same', 'down'] as const;

function readSessions(rows: LegacyRows | undefined, r: LegacyTabReport): LegacySession[] {
  // Rows of one logged event share a date and "Logged at" (as the original app grouped them).
  const events = new Map<
    string,
    { date: string; stamp: string; id: string; w: string; s: string; lifts: LegacySession['lifts'] }
  >();
  for (const { cells, n } of dataRows(rows, 10)) {
    r.rows++;
    const [d, w, s, lift, dir, wt, , logged, id, reps] = cells;
    const date = legacyDate(d);
    if (!date) {
      skip(r, n, 'no date');
      continue;
    }
    const stamp = text(logged, 40);
    const k = `${date}|${stamp}`;
    let ev = events.get(k);
    if (!ev) {
      ev = { date, stamp, id: text(id, 60), w: '', s: '', lifts: {} };
      events.set(k, ev);
    }
    if (text(w)) ev.w = text(w, 30);
    if (text(s)) ev.s = text(s).toLowerCase();
    const name = text(lift, 40);
    if (name) {
      const dv = text(dir).toLowerCase();
      const wn = legacyNumber(wt);
      const rn = legacyNumber(reps);
      ev.lifts[name] = {
        dir: (DIRS as readonly string[]).includes(dv) ? (dv as (typeof DIRS)[number]) : null,
        wt: wn != null && wn >= 0 ? wn : null,
        reps: rn != null && rn > 0 ? Math.round(rn) : null,
      };
    }
  }
  const out: LegacySession[] = [];
  for (const ev of events.values()) {
    const status = (STATUSES as readonly string[]).includes(ev.s)
      ? (ev.s as LegacySession['status'])
      : ev.w || Object.keys(ev.lifts).length
        ? 'done'
        : null;
    if (!status) {
      skip(r, 0, `${ev.date}: an entry with no workout or status`);
      continue;
    }
    const at = legacyStamp(ev.stamp) ?? { date: ev.date, time: '12:00:00' };
    out.push({
      key: ev.id
        ? eventKey('training', ev.id)
        : `legacy:training:${fingerprint([ev.date, ev.stamp])}`,
      date: ev.date,
      workout: status === 'rest' ? null : ev.w || null,
      status,
      lifts: status === 'rest' ? {} : ev.lifts,
      loggedAt: at,
    });
    r.entries++;
    span(r, ev.date);
  }
  // Row numbers aren't meaningful for grouped entries.
  r.problems = r.problems.map((p) => p.replace(/^Row 0: /, ''));
  return out;
}

function readPlan(rows: LegacyRows | undefined, r: LegacyTabReport): LegacyPlanWorkout[] | null {
  const items: Array<{
    w: string;
    n: string;
    sets: string;
    star: 0 | 1;
    order: number;
    i: number;
  }> = [];
  dataRows(rows, 5).forEach(({ cells, n }, i) => {
    r.rows++;
    const [w, ex, sets, key, order] = cells;
    if (!text(w) || !text(ex)) {
      skip(r, n, 'no workout or exercise');
      return;
    }
    items.push({
      w: text(w, 30),
      n: text(ex, 40),
      sets: text(sets, 20),
      star: /^x$/i.test(text(key)) ? 1 : 0,
      order: legacyNumber(order) ?? Number.MAX_SAFE_INTEGER,
      i,
    });
    r.entries++;
  });
  if (!items.length) return null;
  items.sort((a, b) => a.order - b.order || a.i - b.i);
  const plan: LegacyPlanWorkout[] = [];
  for (const it of items) {
    let w = plan.find((p) => p.name === it.w);
    if (!w) {
      w = { name: it.w, ex: [] };
      plan.push(w);
    }
    w.ex.push({ n: it.n, sets: it.sets, star: it.star });
  }
  return plan;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'habit';

function readHabits(rows: LegacyRows | undefined, r: LegacyTabReport): LegacyHabit[] {
  const out: LegacyHabit[] = [];
  const taken = new Set<string>();
  for (const { cells, n } of dataRows(rows, 3)) {
    r.rows++;
    const name = text(cells[0], 30);
    if (!name) {
      skip(r, n, 'no habit name');
      continue;
    }
    let id =
      text(cells[1], 30)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '') || slug(name);
    for (let i = 2; taken.has(id); i++) id = `${slug(name)}-${i}`;
    taken.add(id);
    out.push({ id, name, archived: /^x$/i.test(text(cells[2])), position: out.length });
    r.entries++;
  }
  return out;
}

function readHabitLog(rows: LegacyRows | undefined, r: LegacyTabReport): LegacyHabitCheck[] {
  // The latest tap for a habit on a day wins.
  const latest = new Map<string, { check: LegacyHabitCheck; at: string; n: number }>();
  for (const { cells, n } of dataRows(rows, 5)) {
    r.rows++;
    const [d, h, done, logged] = cells;
    const date = legacyDate(d);
    const habitId = text(h, 30).toLowerCase();
    if (!date || !habitId) {
      skip(r, n, date ? 'no habit id' : 'no date');
      continue;
    }
    const at = text(logged, 40);
    const k = `${date}|${habitId}`;
    const prev = latest.get(k);
    if (!prev || at > prev.at || (at === prev.at && n > prev.n)) {
      const v = typeof done === 'string' ? done.trim().toLowerCase() : done;
      latest.set(k, {
        check: {
          date,
          habitId,
          done: v === 1 || v === true || v === '1' || v === 'true' || v === 'x',
        },
        at,
        n,
      });
    }
    span(r, date);
  }
  const out = [...latest.values()].map((x) => x.check);
  r.entries = out.length;
  return out;
}

function readMoods(rows: LegacyRows | undefined, r: LegacyTabReport): LegacyMood[] {
  const key = contentKeys('mood');
  const out: LegacyMood[] = [];
  for (const { cells, n } of dataRows(rows, 6)) {
    r.rows++;
    const [d, t, m, note, logged, id] = cells;
    const date = legacyDate(d);
    const mood = legacyNumber(m);
    if (!date) {
      skip(r, n, 'no date');
      continue;
    }
    if (mood == null || mood < 1 || mood > 5) {
      skip(r, n, 'mood is not 1 to 5');
      continue;
    }
    const at = legacyStamp(logged) ?? { date, time: legacyTime(t) ?? '12:00:00' };
    const eid = text(id, 60);
    out.push({
      key: eid ? eventKey('mood', eid) : key([date, at.time, mood, text(note, 200)]),
      date,
      mood: Math.round(mood),
      note: text(note, 200),
      loggedAt: at,
    });
    r.entries++;
    span(r, date);
  }
  return out;
}

function readGoals(rows: LegacyRows | undefined, r: LegacyTabReport): LegacyGoals | null {
  if (!rows?.length) return null;
  const b = (i: number) => rows[i]?.[1] ?? null;
  const val = (i: number, lo: number, hi: number) => {
    const v = legacyNumber(b(i));
    return v != null && v >= lo && v <= hi ? Math.round(v) : null;
  };
  const goals: LegacyGoals = {
    kcal: val(0, 1000, 6000),
    protein: val(1, 40, 400),
    steps: val(2, 1000, 50_000),
    activeKcal: val(3, 50, 3000),
    goalsSet: text(b(6)).toLowerCase() === 'set',
  };
  const found = [goals.kcal, goals.protein, goals.steps, goals.activeKcal].filter((v) => v != null);
  r.rows = 4;
  r.entries = found.length;
  r.skipped = 4 - found.length;
  return found.length ? goals : null;
}

/** Read the original sheet's tabs into new records, with a report per tab. */
export function readLegacyWorkbook(wb: LegacyWorkbook): LegacyImport {
  // Tab names as the user may have them ("weight log", extra spaces).
  const byName = new Map(Object.entries(wb).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const tab = (t: LegacyTab) => byName.get(t.toLowerCase());
  const found = LEGACY_TABS.filter((t) => byName.has(t.toLowerCase()));
  const report = Object.fromEntries(LEGACY_TABS.map((t) => [t, newReport(t)])) as Record<
    LegacyTab,
    LegacyTabReport
  >;
  const habits = readHabits(tab('Habits'), report.Habits);
  const habitChecks = readHabitLog(tab('Habit Log'), report['Habit Log']);
  // Ticks for habits that aren't on the list: add the habit (hidden), so history isn't lost.
  for (const id of new Set(habitChecks.map((c) => c.habitId)))
    if (!habits.some((h) => h.id === id))
      habits.push({ id, name: id.replace(/[-_]+/g, ' '), archived: true, position: habits.length });
  return {
    goals: readGoals(tab('Settings'), report.Settings),
    meals: readMeals(tab('Nutrition Log'), report['Nutrition Log']),
    weights: readWeights(tab('Weight Log'), report['Weight Log']),
    sessions: readSessions(tab('Training Log'), report['Training Log']),
    plan: readPlan(tab('Plan'), report.Plan),
    habits,
    habitChecks,
    moods: readMoods(tab('Mood Log'), report['Mood Log']),
    report: LEGACY_TABS.filter((t) => byName.has(t.toLowerCase())).map((t) => report[t]),
    found,
  };
}
