import type { ToolInput } from './tools.js';

/*
 * The original HeroArc API (scripts/server.py in the first app), which Hermes and n8n already
 * call: POST /food, /weight, /training, /sync and GET /today with a bearer key. These functions
 * turn its JSON bodies into agent tool inputs, validating the way it did: numbers may arrive as
 * text ("450"), and a bad field is a 400 with a sentence saying which.
 */

export class HermesInputError extends Error {}

type Body = Record<string, unknown>;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function num(b: Body, k: string, lo: number, hi: number, required: true): number;
function num(b: Body, k: string, lo: number, hi: number, required: false): number | undefined;
function num(b: Body, k: string, lo: number, hi: number, required: boolean): number | undefined {
  let v = b[k];
  if (v == null) {
    if (required) throw new HermesInputError(`${k} is required`);
    return undefined;
  }
  // AI tool calls often send numbers as text.
  if (typeof v === 'string') {
    const t = v.trim();
    v = t === '' ? Number.NaN : Number(t);
  }
  if (typeof v !== 'number' || Number.isNaN(v)) throw new HermesInputError(`${k} must be a number`);
  if (v < lo || v > hi) throw new HermesInputError(`${k}=${v} is outside ${lo}..${hi}`);
  return v;
}

function text(b: Body, k: string, required: true, n?: number): string;
function text(b: Body, k: string, required: false, n?: number): string | undefined;
function text(b: Body, k: string, required: boolean, n = 300): string | undefined {
  const v = b[k];
  if (v == null || v === '') {
    if (required) throw new HermesInputError(`${k} is required`);
    return undefined;
  }
  if (typeof v !== 'string' || v.length > n)
    throw new HermesInputError(`${k} must be text up to ${n} characters`);
  return v.replace(/\n/g, ' ').trim();
}

function dateOf(b: Body): string | undefined {
  const v = b.date;
  if (!v) return undefined;
  if (typeof v !== 'string' || !DATE.test(v))
    throw new HermesInputError('date must look like YYYY-MM-DD');
  return v;
}

function timeOf(b: Body): string | undefined {
  const v = b.time;
  if (!v) return undefined;
  if (typeof v !== 'string' || !TIME.test(v))
    throw new HermesInputError('time must look like HH:MM');
  return v;
}

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

/** POST /food {meal, items, kcal, p, c, f, conf?, source?, notes?, date?, time?, dry_run?} */
export function foodInput(b: Body): { input: ToolInput<'log_meal'>; dryRun: boolean } {
  const label = text(b, 'meal', true, 40);
  const meal = MEALS.find((m) => m.toLowerCase() === label.toLowerCase());
  if (!meal) throw new HermesInputError('meal must be Breakfast, Lunch, Dinner or Snack');
  const conf = text(b, 'conf', false, 120)?.toLowerCase();
  const confidence = conf?.startsWith('h')
    ? 'High'
    : conf?.startsWith('m')
      ? 'Medium'
      : conf?.startsWith('l')
        ? 'Low'
        : undefined;
  const notes = text(b, 'notes', false, 300);
  const date = dateOf(b);
  const time = timeOf(b);
  text(b, 'source', false, 120); // accepted and checked as before; the agent is recorded instead
  return {
    input: {
      meal,
      items: text(b, 'items', true),
      kcal: num(b, 'kcal', 0, 5000, true),
      protein_g: num(b, 'p', 0, 500, true),
      carbs_g: num(b, 'c', 0, 1000, true),
      fat_g: num(b, 'f', 0, 500, true),
      ...(confidence && { confidence }),
      ...(notes && { notes }),
      ...(date && { date }),
      ...(time && { time }),
    },
    dryRun: b.dry_run === true,
  };
}

/** POST /weight {lb, date?} */
export function weightInput(b: Body): ToolInput<'log_weight'> {
  const date = dateOf(b);
  return { lb: num(b, 'lb', 50, 700, true), ...(date && { date }) };
}

/** The day's current session, as get_day reports it. */
export interface CurrentSession {
  workout: string | null;
  status: string;
  lifts: Record<string, { wt?: number | null; reps?: number | null }> | null;
}

/**
 * POST /training {workout, status?, lift?, lb?, reps?, date?}: one workout per call, with at most
 * one lift. Calls for the same workout on the same day add up (the original kept one row per day),
 * so the day's current session's lifts are carried over.
 */
export function trainingInput(b: Body, current?: CurrentSession): ToolInput<'log_training'> {
  const workout = text(b, 'workout', true, 60);
  const st = text(b, 'status', false, 10)?.toLowerCase();
  if (st && !['done', 'partial', 'rest'].includes(st))
    throw new HermesInputError('status must be done, partial or rest');
  const lift = text(b, 'lift', false, 80);
  const lb = num(b, 'lb', 0, 2000, false);
  const reps = num(b, 'reps', 1, 100, false);
  if ((lift || lb != null || reps != null) && !(lift && lb != null && reps != null))
    throw new HermesInputError('give lift, lb and reps together, or none of them');
  const date = dateOf(b);
  const status = (st ?? 'done') as 'done' | 'partial' | 'rest';

  const same = current?.workout != null && current.workout.toLowerCase() === workout.toLowerCase();
  const lifts: Record<string, { wt: number; reps?: number }> = {};
  if (same)
    for (const [k, v] of Object.entries(current?.lifts ?? {}))
      if (typeof v?.wt === 'number') lifts[k] = { wt: v.wt, ...(v.reps ? { reps: v.reps } : {}) };
  if (lift && lb != null && reps != null) lifts[lift] = { wt: lb, reps: Math.round(reps) };

  return {
    ...(status !== 'rest' && { workout: same ? (current?.workout as string) : workout }),
    status,
    ...(Object.keys(lifts).length > 0 && { lifts }),
    ...(date && { date }),
  };
}
