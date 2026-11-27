import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * HeroArc health data. Every table is per user (`userId`). Until Better Auth lands
 * (Phase 1) the API uses a single development user; foreign keys to the auth `user`
 * table are added then (additive migration).
 *
 * Writes from the app and from agents carry a client-generated `eventId`; the unique
 * (userId, eventId) index makes retries harmless, like the original app's event ids.
 */

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
/** The user's local calendar day, 'YYYY-MM-DD'. */
const day = () => date({ mode: 'string' }).notNull();

/** Current calorie/protein/step goals plus the calculator inputs used to pick them. */
export const userGoals = pgTable('user_goals', {
  userId: text().primaryKey(),
  kcal: integer().notNull(),
  proteinG: integer().notNull(),
  steps: integer().notNull().default(10000),
  activeKcal: integer().notNull().default(500),
  /** Fat and carbs goals (g); null until set (the app then derives them from kcal and protein). */
  carbsG: integer(),
  fatG: integer(),
  /** Show fat and carbs next to calories and protein. */
  trackMacros: boolean().notNull().default(false),
  /** True once the user saved goals themselves (otherwise the app shows starter numbers). */
  goalsSet: boolean().notNull().default(false),
  sex: text(),
  age: integer(),
  heightIn: real(),
  weightLb: real(),
  activity: text(),
  goal: text(),
  updatedAt: updatedAt(),
});

/** One row per user per day of wearable data (Oura today). */
export const dailyMetrics = pgTable(
  'daily_metrics',
  {
    userId: text().notNull(),
    date: day(),
    sleepScore: integer(),
    readiness: integer(),
    sleepHours: real(),
    hrv: real(),
    rhr: real(),
    /** Minutes after local midnight. */
    bedMin: integer(),
    wakeMin: integer(),
    stressMin: integer(),
    recoveryMin: integer(),
    stressSummary: text(),
    steps: integer(),
    activeKcal: integer(),
    totalKcal: integer(),
    source: text().notNull().default('oura'),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

/** Weigh-ins in pounds (as entered). The latest entry for a day is that day's weight. */
export const weightEntries = pgTable(
  'weight_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    date: day(),
    weightLb: real().notNull(),
    source: text().notNull().default('app'),
    eventId: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.date), uniqueIndex().on(t.userId, t.eventId)],
);

/** One logged meal (the original "Nutrition Log" row). Daily totals are summed from these. */
export const meals = pgTable(
  'meals',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    date: day(),
    /** Local time 'HH:MM', if known. */
    time: text(),
    /** Breakfast, Lunch, Dinner, Snack… */
    meal: text().notNull(),
    /** Human-readable items, e.g. "chicken, rice". */
    items: text().notNull(),
    kcal: real().notNull(),
    proteinG: real().notNull(),
    carbsG: real(),
    fatG: real(),
    /** Estimate confidence: Low / Medium / High. */
    confidence: text(),
    /** e.g. "photo estimate", "label". */
    source: text(),
    notes: text(),
    /** Who logged it: 'user', 'agent:<name>', 'chat'. */
    createdBy: text().notNull().default('user'),
    /** A photo of the meal (coach_attachments), if one was sent. */
    photoId: uuid(),
    eventId: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.date), uniqueIndex().on(t.userId, t.eventId)],
);

/** The user's habit list. `id` is a short slug, stable across renames. */
export const habits = pgTable(
  'habits',
  {
    userId: text().notNull(),
    id: text().notNull(),
    name: text().notNull(),
    position: integer().notNull().default(0),
    archived: boolean().notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);

/** Done / not done per habit per day (latest tap wins). */
export const habitChecks = pgTable(
  'habit_checks',
  {
    userId: text().notNull(),
    date: day(),
    habitId: text().notNull(),
    done: boolean().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date, t.habitId] })],
);

/** Mood check-ins (1–5 with an optional note). Append-only. */
export const moodEntries = pgTable(
  'mood_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    date: day(),
    mood: smallint().notNull(),
    note: text().notNull().default(''),
    loggedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    eventId: text(),
  },
  (t) => [index().on(t.userId, t.date), uniqueIndex().on(t.userId, t.eventId)],
);

export interface PlanExercise {
  n: string;
  sets: string;
  /** 1 = key lift (track a max). */
  star: 0 | 1;
}
export interface PlanWorkout {
  name: string;
  ex: PlanExercise[];
}

/** The user's training plan, replaced as a whole by the plan editor (history is untouched). */
export const trainingPlans = pgTable('training_plans', {
  userId: text().primaryKey(),
  workouts: jsonb().$type<PlanWorkout[]>().notNull(),
  updatedAt: updatedAt(),
});

export interface LiftEntry {
  dir?: 'up' | 'same' | 'down' | null;
  wt?: number | null;
  reps?: number | null;
}

/** Training taps. The newest entry for a day is that day's session (edits never delete). */
export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    date: day(),
    workout: text(),
    /** done | partial | rest */
    status: text().notNull(),
    lifts: jsonb().$type<Record<string, LiftEntry>>().notNull().default({}),
    loggedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    eventId: text(),
  },
  (t) => [index().on(t.userId, t.date), uniqueIndex().on(t.userId, t.eventId)],
);
