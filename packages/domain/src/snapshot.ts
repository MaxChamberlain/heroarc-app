import type {
  DaySnapshot,
  HabitsSection,
  MoodSection,
  Snapshot,
  TrainingLogEntry,
  TrainingSection,
} from '@heroarc/contracts';
import { localClock, localDate, shiftDate, zoneAbbrev } from './dates.js';
import { macroSplit } from './goals.js';

/*
 * Builds the app snapshot (the original `api/data` document) from plain rows.
 * Ported from the original app_push.build() plus the training/habits/mood
 * snapshot_section() helpers. Pure: the API loads rows and calls this.
 */

export interface MetricsRow {
  date: string;
  sleepScore: number | null;
  readiness: number | null;
  sleepHours: number | null;
  hrv: number | null;
  rhr: number | null;
  bedMin: number | null;
  wakeMin: number | null;
  stressMin: number | null;
  recoveryMin: number | null;
  stressSummary: string | null;
  steps: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  updatedAt: Date;
}

export interface WeightRow {
  date: string;
  weightLb: number;
  createdAt: Date;
}

export interface MealRow {
  date: string;
  kcal: number;
  proteinG: number;
  carbsG?: number | null;
  fatG?: number | null;
}

export interface GoalsRow {
  kcal: number;
  proteinG: number;
  carbsG?: number | null;
  fatG?: number | null;
  trackMacros?: boolean;
  steps: number;
  activeKcal: number;
  goalsSet: boolean;
  sex: string | null;
  age: number | null;
  heightIn: number | null;
  weightLb: number | null;
  activity: string | null;
  goal: string | null;
}

export interface HabitRow {
  id: string;
  name: string;
  position: number;
  archived: boolean;
}

export interface HabitCheckRow {
  date: string;
  habitId: string;
  done: boolean;
}

export interface MoodRow {
  date: string;
  mood: number;
  note: string;
  loggedAt: Date;
}

export interface PlanWorkoutRow {
  name: string;
  ex: ReadonlyArray<{ n: string; sets: string; star: 0 | 1 }>;
}

export interface SessionRow {
  date: string;
  workout: string | null;
  status: string;
  lifts: Record<
    string,
    { dir?: 'up' | 'same' | 'down' | null; wt?: number | null; reps?: number | null }
  >;
  loggedAt: Date;
}

export interface SnapshotInput {
  now: Date;
  /** IANA zone, e.g. "America/Denver". */
  timeZone: string;
  goals: GoalsRow | null;
  metrics: readonly MetricsRow[];
  weights: readonly WeightRow[];
  meals: readonly MealRow[];
  habits: readonly HabitRow[];
  habitChecks: readonly HabitCheckRow[];
  moods: readonly MoodRow[];
  plan: readonly PlanWorkoutRow[] | null;
  sessions: readonly SessionRow[];
}

/** Defaults the original used when the Settings tab was empty. */
export const DEFAULT_GOALS = { kcal: 2200, protein: 150, steps: 10000, activeKcal: 500 } as const;

export const HISTORY_DAYS = 90;
export const TREND_DAYS = 14;
export const TRAINING_LOG_DAYS = 120;
export const HABIT_LOG_DAYS = 400;
export const MOOD_LOG_DAYS = 120;
export const MAX_ACTIVE_HABITS = 8;

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const { now, timeZone } = input;
  const today = localDate(now, timeZone);

  const metrics = new Map(input.metrics.map((m) => [m.date, m]));
  const weights = latestWeightByDay(input.weights);
  const nutrition = sumNutrition(input.meals);

  const ouraDay =
    [...metrics.values()]
      .filter((m) => m.sleepScore != null || m.readiness != null)
      .map((m) => m.date)
      .sort()
      .at(-1) ?? null;

  const days: Record<string, DaySnapshot> = {};
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const d = shiftDate(today, -i);
    const m = metrics.get(d);
    const nn = nutrition.get(d);
    const w = weights.get(d);
    const hasWearable =
      !!m &&
      (m.sleepScore != null ||
        m.readiness != null ||
        m.steps != null ||
        m.activeKcal != null ||
        m.totalKcal != null ||
        !!m.stressSummary);
    if (!hasWearable && w == null && !nn) continue;
    days[d] = {
      sleep: m?.sleepScore ?? null,
      readiness: m?.readiness ?? null,
      sleepHours: m?.sleepHours ?? null,
      hrv: m?.hrv ?? null,
      rhr: m?.rhr ?? null,
      bed: m?.bedMin ?? null,
      wake: m?.wakeMin ?? null,
      stressMin: m?.stressMin ?? null,
      recoverMin: m?.recoveryMin ?? null,
      stressSummary: m?.stressSummary || null,
      steps: m?.steps ?? null,
      activeKcal: m?.activeKcal ?? null,
      totalKcal: m?.totalKcal ?? null,
      weight: w ?? null,
      kcalIn: nn ? Math.round(nn.kcal) : null,
      protein: nn ? Math.round(nn.protein) : null,
      carbs: nn?.carbs == null ? null : Math.round(nn.carbs),
      fat: nn?.fat == null ? null : Math.round(nn.fat),
    };
  }

  const trend = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = shiftDate(today, -i);
    const m = metrics.get(d);
    trend.push({
      d,
      sleep: m?.sleepScore ?? null,
      readiness: m?.readiness ?? null,
      weight: weights.get(d) ?? null,
    });
  }

  const g = input.goals;
  const kcalGoal = g?.kcal ?? DEFAULT_GOALS.kcal;
  const proteinGoal = Math.round(g?.proteinG ?? DEFAULT_GOALS.protein);
  // Fat and carbs goals the user hasn't set come from the calorie and protein goals.
  const split = macroSplit(kcalGoal, proteinGoal);
  const goals = {
    steps: g?.steps ?? DEFAULT_GOALS.steps,
    activeKcal: g?.activeKcal ?? DEFAULT_GOALS.activeKcal,
    kcal: kcalGoal,
    protein: proteinGoal,
    carbs: g?.carbsG ?? split.carbs,
    fat: g?.fatG ?? split.fat,
    trackMacros: g?.trackMacros ?? false,
    goalsSet: g?.goalsSet ?? false,
  };

  const o = metrics.get(today);
  const last = ouraDay ? metrics.get(ouraDay) : undefined;
  const tn = nutrition.get(today) ?? { kcal: 0, protein: 0 };
  const lastWeightDay = [...weights.keys()].sort().at(-1);

  const latestUpdate = input.metrics.reduce<Date | null>(
    (a, m) => (!a || m.updatedAt > a ? m.updatedAt : a),
    null,
  );
  const stamp = latestUpdate ?? now;

  return {
    sample: false,
    training: trainingSection(input.plan, input.sessions, today),
    habits: habitsSection(input.habits, input.habitChecks, today),
    mood: moodSection(input.moods, today, timeZone),
    days,
    goals,
    goalsForm: g?.sex
      ? {
          sex: g.sex as 'female' | 'male',
          age: g.age,
          height: g.heightIn,
          weight: g.weightLb,
          activity: g.activity as 'sedentary' | 'light' | 'moderate' | 'active' | 'very active',
          goal: g.goal as 'lose' | 'maintain' | 'gain',
          kcal: g.kcal,
          protein: g.proteinG,
          carbs: g.carbsG ?? null,
          fat: g.fatG ?? null,
          trackMacros: g.trackMacros ?? false,
        }
      : null,
    date: today,
    updated: `${localClock(stamp, timeZone)} ${zoneAbbrev(stamp, timeZone)}`.trim(),
    ouraDay,
    today: {
      steps: o?.steps ?? 0,
      stepsGoal: goals.steps,
      activeKcal: o?.activeKcal ?? 0,
      totalKcal: o?.totalKcal ?? null,
      activeGoal: goals.activeKcal,
      kcalIn: Math.round(tn.kcal),
      kcalTarget: goals.kcal,
      protein: Math.round(tn.protein),
      proteinTarget: goals.protein,
      readiness: last?.readiness ?? null,
      sleep: last?.sleepScore ?? null,
      sleepHours: last?.sleepHours ?? null,
      hrv: last?.hrv ?? null,
      rhr: last?.rhr ?? null,
      bed: last?.bedMin ?? null,
      wake: last?.wakeMin ?? null,
      weight: lastWeightDay ? (weights.get(lastWeightDay) ?? null) : null,
    },
    trend,
  };
}

/** The newest entry for each day wins (re-entering a weight replaces it). */
function latestWeightByDay(rows: readonly WeightRow[]): Map<string, number> {
  const best = new Map<string, WeightRow>();
  for (const r of rows) {
    const prev = best.get(r.date);
    if (!prev || r.createdAt >= prev.createdAt) best.set(r.date, r);
  }
  return new Map([...best].map(([d, r]) => [d, r.weightLb]));
}

interface DayNutrition {
  kcal: number;
  protein: number;
  /** Null when no meal that day recorded it. */
  carbs: number | null;
  fat: number | null;
}

function sumNutrition(rows: readonly MealRow[]): Map<string, DayNutrition> {
  const out = new Map<string, DayNutrition>();
  for (const r of rows) {
    const a = out.get(r.date) ?? { kcal: 0, protein: 0, carbs: null, fat: null };
    a.kcal += r.kcal;
    a.protein += r.proteinG;
    if (r.carbsG != null) a.carbs = (a.carbs ?? 0) + r.carbsG;
    if (r.fatG != null) a.fat = (a.fat ?? 0) + r.fatG;
    out.set(r.date, a);
  }
  return out;
}

function trainingSection(
  plan: readonly PlanWorkoutRow[] | null,
  sessions: readonly SessionRow[],
  today: string,
): TrainingSection {
  const workouts = (plan ?? []).map((w) => ({
    name: w.name,
    exercises: w.ex.map((x) => ({ n: x.n, sets: x.sets, type: '' })),
    keyLifts: w.ex.filter((x) => x.star === 1).map((x) => x.n),
  }));

  const latest = new Map<string, SessionRow>();
  for (const s of sessions) {
    const prev = latest.get(s.date);
    if (!prev || s.loggedAt >= prev.loggedAt) latest.set(s.date, s);
  }
  const cut = shiftDate(today, -TRAINING_LOG_DAYS);
  const log: TrainingLogEntry[] = [...latest.values()]
    .filter((s) => s.date > cut)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((s) => ({
      d: s.date,
      w: s.workout || null,
      s: isStatus(s.status) ? s.status : null,
      lifts: Object.fromEntries(
        Object.entries(s.lifts ?? {}).map(([name, v]) => [
          name,
          { dir: v.dir ?? null, wt: v.wt ?? null, reps: v.reps ?? null },
        ]),
      ),
      t: s.loggedAt.toISOString(),
    }));

  return { program: { workouts, keyLifts: [] }, log, pending: [] };
}

function isStatus(s: string): s is 'done' | 'partial' | 'rest' {
  return s === 'done' || s === 'partial' || s === 'rest';
}

function habitsSection(
  habits: readonly HabitRow[],
  checks: readonly HabitCheckRow[],
  today: string,
): HabitsSection {
  const ordered = [...habits].sort((a, b) => a.position - b.position);
  const list = ordered
    .filter((h) => !h.archived)
    .slice(0, MAX_ACTIVE_HABITS)
    .map((h) => ({ id: h.id, n: h.name }));
  const archived = ordered
    .filter((h) => h.archived)
    .slice(0, 40)
    .map((h) => ({ id: h.id, n: h.name }));

  const cut = shiftDate(today, -HABIT_LOG_DAYS);
  const byDay = new Map<string, string[]>();
  for (const c of checks) {
    if (!c.done || c.date < cut) continue;
    const ids = byDay.get(c.date) ?? [];
    ids.push(c.habitId);
    byDay.set(c.date, ids);
  }
  const log = Object.fromEntries(
    [...byDay.keys()].sort().map((d) => [d, [...(byDay.get(d) ?? [])].sort()]),
  );
  return { list, archived, log, pending: [] };
}

function moodSection(moods: readonly MoodRow[], today: string, timeZone: string): MoodSection {
  const cut = shiftDate(today, -MOOD_LOG_DAYS);
  const byDay = new Map<string, MoodRow[]>();
  for (const m of moods) {
    if (m.date < cut) continue;
    const a = byDay.get(m.date) ?? [];
    a.push(m);
    byDay.set(m.date, a);
  }
  const log = Object.fromEntries(
    [...byDay.keys()]
      .sort()
      .map((d) => [
        d,
        [...(byDay.get(d) ?? [])]
          .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())
          .map((m) => ({ t: localClock(m.loggedAt, timeZone), m: m.mood, n: m.note })),
      ]),
  );
  return { log, pending: [] };
}
