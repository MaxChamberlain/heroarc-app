import { oc } from '@orpc/contract';
import { z } from 'zod';

/*
 * Compatibility API for the original HeroArc page (served at / by apps/web while it is
 * being ported to React). Paths and payloads match the original Cloudflare Worker exactly
 * (github.com/erguniozdjan/heroarc app/worker.template.js), so the page runs unchanged.
 * Validation rules are copied from that Worker's validators.
 *
 * New features should get proper /api/v1 routes; these stay until the port is done.
 */

const n = z.number().nullable();

/** One day of data, as the page reads it from `days[date]`. */
export const DaySnapshot = z.object({
  sleep: n,
  readiness: n,
  sleepHours: n,
  hrv: n,
  rhr: n,
  /** Minutes after local midnight. */
  bed: n,
  wake: n,
  stressMin: n,
  recoverMin: n,
  stressSummary: z.string().nullable(),
  steps: n,
  activeKcal: n,
  totalKcal: n,
  weight: n,
  kcalIn: n,
  protein: n,
  /** Grams eaten; null when no meal that day recorded it. */
  carbs: n,
  fat: n,
});
export type DaySnapshot = z.infer<typeof DaySnapshot>;

export const LiftDirection = z.enum(['up', 'same', 'down']);

export const LiftResult = z.object({
  dir: LiftDirection.nullable(),
  wt: n,
  reps: n,
});

export const TrainingLogEntry = z.object({
  d: z.string(),
  w: z.string().nullable(),
  s: z.enum(['done', 'partial', 'rest']).nullable(),
  lifts: z.record(z.string(), LiftResult),
  t: z.string(),
});
export type TrainingLogEntry = z.infer<typeof TrainingLogEntry>;

export const TrainingSection = z.object({
  program: z.object({
    workouts: z.array(
      z.object({
        name: z.string(),
        exercises: z.array(z.object({ n: z.string(), sets: z.string(), type: z.string() })),
        keyLifts: z.array(z.string()),
      }),
    ),
    keyLifts: z.array(z.string()),
  }),
  log: z.array(TrainingLogEntry),
  pending: z.array(z.unknown()),
});
export type TrainingSection = z.infer<typeof TrainingSection>;

const HabitRef = z.object({ id: z.string(), n: z.string() });

export const HabitsSection = z.object({
  list: z.array(HabitRef),
  archived: z.array(HabitRef),
  /** date → ids of habits done that day. */
  log: z.record(z.string(), z.array(z.string())),
  pending: z.array(z.unknown()),
});
export type HabitsSection = z.infer<typeof HabitsSection>;

export const MoodSection = z.object({
  /** date → entries oldest-first; `t` is local clock time like "7:15 PM". */
  log: z.record(
    z.string(),
    z.array(z.object({ t: z.string(), m: z.number().int(), n: z.string() })),
  ),
  pending: z.array(z.unknown()),
});
export type MoodSection = z.infer<typeof MoodSection>;

export const GoalsSnapshot = z.object({
  steps: z.number(),
  activeKcal: z.number(),
  kcal: z.number(),
  protein: z.number(),
  /** Grams; derived from kcal and protein until the user sets them. */
  carbs: z.number(),
  fat: z.number(),
  /** Show fat and carbs next to calories and protein. */
  trackMacros: z.boolean(),
  /** False until the user saves goals themselves (the page then shows "starter numbers"). */
  goalsSet: z.boolean(),
});

export const Sex = z.enum(['female', 'male']);
export const ActivityLevel = z.enum(['sedentary', 'light', 'moderate', 'active', 'very active']);
export const GoalType = z.enum(['lose', 'maintain', 'gain']);

/** Last calculator inputs, used to pre-fill the Goals form. */
export const GoalsForm = z.object({
  sex: Sex.nullable(),
  age: n,
  height: n,
  weight: n,
  activity: ActivityLevel.nullable(),
  goal: GoalType.nullable(),
  kcal: z.number(),
  protein: z.number(),
  carbs: n,
  fat: n,
  trackMacros: z.boolean(),
});

export const TodaySnapshot = z.object({
  steps: z.number(),
  stepsGoal: z.number(),
  activeKcal: z.number(),
  totalKcal: n,
  activeGoal: z.number(),
  kcalIn: z.number(),
  kcalTarget: z.number(),
  protein: z.number(),
  proteinTarget: z.number(),
  readiness: n,
  sleep: n,
  sleepHours: n,
  hrv: n,
  rhr: n,
  bed: n,
  wake: n,
  weight: n,
});

/** Everything the page shows, in one document (the original `api/data`). */
export const Snapshot = z.object({
  sample: z.boolean(),
  training: TrainingSection.nullable(),
  habits: HabitsSection.nullable(),
  mood: MoodSection.nullable(),
  /** Last 90 days that have any data, newest first. */
  days: z.record(z.string(), DaySnapshot),
  goals: GoalsSnapshot,
  goalsForm: GoalsForm.nullable(),
  /** Today in the user's timezone. */
  date: z.string(),
  /** When the data last changed, e.g. "7:15 PM MST". */
  updated: z.string(),
  /** Latest day with a sleep or readiness score. */
  ouraDay: z.string().nullable(),
  today: TodaySnapshot,
  /** 14 days ending today, oldest first. */
  trend: z.array(z.object({ d: z.string(), sleep: n, readiness: n, weight: n })),
});
export type Snapshot = z.infer<typeof Snapshot>;

// ---------- events the page posts (validation copied from the original Worker) ----------

/** Client-generated id; makes retries harmless. */
export const EventId = z.string().regex(/^[A-Za-z0-9_-]{4,40}$/);
export const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => !Number.isNaN(Date.parse(`${d}T12:00:00Z`)), 'invalid date');
const HabitId = z.string().regex(/^[a-z0-9_-]{1,30}$/);
/** True if `s` contains an ASCII control character (U+0000–U+001F). */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 0x20) return true;
  return false;
}
/** Text that can't start like a spreadsheet formula or carry control characters. */
const isSafeText = (s: string) => !/^[=+@]/.test(s) && !hasControlChar(s);
/** Names can't start with characters a spreadsheet would treat as a formula, or contain control chars. */
const SafeName = (max: number) =>
  z.string().trim().min(1).max(max).refine(isSafeText, 'invalid characters');

export const WeightEvent = z.object({
  id: EventId,
  d: Day,
  /** Pounds. */
  w: z.number().min(70).max(500),
});

export const MoodEvent = z.object({
  id: EventId,
  d: Day,
  m: z.number().int().min(1).max(5),
  n: z.string().max(200).nullish(),
});

export const HabitEvent = z.object({
  id: EventId,
  d: Day,
  h: HabitId,
  v: z.union([z.literal(0), z.literal(1)]),
});

export const HabitConfigEvent = z
  .object({
    id: EventId,
    list: z
      .array(
        z.object({
          id: HabitId,
          n: SafeName(30),
          a: z.union([z.literal(0), z.literal(1)]).optional(),
        }),
      )
      .min(1)
      .max(40),
  })
  .refine((e) => new Set(e.list.map((x) => x.id)).size === e.list.length, 'duplicate habit id')
  .refine((e) => e.list.filter((x) => !x.a).length <= 8, 'at most 8 active habits');

export const GoalsEvent = z.object({
  id: EventId,
  sex: Sex,
  age: z.number().min(14).max(100),
  /** Inches. */
  height: z.number().min(48).max(90),
  /** Pounds. */
  weight: z.number().min(70).max(500),
  activity: ActivityLevel,
  goal: GoalType,
  kcal: z.number().min(1000).max(6000),
  protein: z.number().min(40).max(400),
  /** Optional (the original page doesn't send them): fat and carbs goals in grams. */
  carbs: z.number().min(20).max(800).optional(),
  fat: z.number().min(10).max(300).optional(),
  trackMacros: z.boolean().optional(),
});

export const PlanEvent = z
  .object({
    id: EventId,
    workouts: z
      .array(
        z.object({
          name: SafeName(30),
          ex: z
            .array(
              z.object({
                n: SafeName(40),
                sets: z
                  .string()
                  .max(20)
                  .refine(isSafeText, 'invalid characters')
                  .optional()
                  .default(''),
                star: z.union([z.literal(0), z.literal(1)]),
              }),
            )
            .min(1)
            .max(14),
        }),
      )
      .min(1)
      .max(7),
  })
  .refine(
    (e) => new Set(e.workouts.map((w) => w.name.toLowerCase())).size === e.workouts.length,
    'duplicate workout name',
  )
  .refine(
    (e) =>
      e.workouts.every(
        (w) =>
          new Set(w.ex.map((x) => x.n.toLowerCase())).size === w.ex.length &&
          w.ex.reduce((a, x) => a + x.star, 0) <= 8,
      ),
    'duplicate exercise or too many key lifts',
  );

export const TrainingEvent = z.object({
  id: EventId,
  d: Day,
  s: z.enum(['done', 'partial', 'rest']),
  w: z.string().max(30).nullish(),
  lifts: z
    .record(
      z.string().max(40),
      z.object({
        dir: LiftDirection.nullish(),
        wt: z.number().min(0).max(2000).nullish(),
        reps: z.number().int().min(1).max(200).nullish(),
      }),
    )
    .refine((l) => Object.keys(l).length <= 8, 'at most 8 lifts')
    .nullish(),
});

export const SyncRequestEvent = z.object({ id: EventId });

export const Ok = z.object({ ok: z.boolean() });

const post = (path: `/${string}`, summary: string) =>
  oc.route({ method: 'POST', path, summary, tags: ['legacy'] }).output(Ok);

export const legacyContract = {
  data: oc
    .route({
      method: 'GET',
      path: '/api/data',
      summary: 'The whole app snapshot for the signed-in user.',
      tags: ['legacy'],
    })
    .output(Snapshot),
  weight: post('/api/weight', 'Log a weigh-in (lb) for a day.').input(WeightEvent),
  mood: post('/api/mood', 'Add a mood entry (1–5, optional note).').input(MoodEvent),
  habits: post('/api/habits', 'Mark a habit done (1) or not done (0) for a day.').input(HabitEvent),
  habitConfig: post('/api/habit-config', 'Replace the habit list (names, order, archived).').input(
    HabitConfigEvent,
  ),
  goals: post('/api/goals', 'Save calorie and protein goals (and the calculator inputs).').input(
    GoalsEvent,
  ),
  plan: post('/api/plan', 'Replace the training plan.').input(PlanEvent),
  training: post('/api/training', 'Log a training session (done / partial / rest).').input(
    TrainingEvent,
  ),
  syncRequest: post('/api/sync-request', 'Ask for a wearable sync now.').input(SyncRequestEvent),
};
