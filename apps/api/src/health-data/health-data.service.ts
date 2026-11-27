import type { Snapshot } from '@heroarc/contracts';
import { and, type DbHandle, eq, gte, notInArray, schema } from '@heroarc/db';
import {
  buildSnapshot,
  HABIT_LOG_DAYS,
  HISTORY_DAYS,
  localDate,
  MOOD_LOG_DAYS,
  shiftDate,
  TRAINING_LOG_DAYS,
} from '@heroarc/domain';
import { Inject, Injectable } from '@nestjs/common';
import { DB } from '../infra/tokens.js';

const {
  dailyMetrics,
  habitChecks,
  habits,
  meals,
  moodEntries,
  trainingPlans,
  trainingSessions,
  userGoals,
  weightEntries,
} = schema;

export interface WeightInput {
  eventId: string;
  date: string;
  weightLb: number;
  source?: string;
}
export interface MoodInput {
  eventId: string;
  date: string;
  mood: number;
  note?: string | null;
}
export interface HabitCheckInput {
  date: string;
  habitId: string;
  done: boolean;
}
export interface HabitConfigInput {
  list: ReadonlyArray<{ id: string; n: string; a?: 0 | 1 }>;
}
export interface GoalsInput {
  sex: string;
  age: number;
  height: number;
  weight: number;
  activity: string;
  goal: string;
  kcal: number;
  protein: number;
  carbs?: number;
  fat?: number;
  trackMacros?: boolean;
}
export interface PlanInput {
  workouts: ReadonlyArray<{
    name: string;
    ex: ReadonlyArray<{ n: string; sets?: string; star: 0 | 1 }>;
  }>;
}
export interface TrainingInput {
  eventId: string;
  date: string;
  status: 'done' | 'partial' | 'rest';
  workout?: string | null;
  lifts?: Record<
    string,
    { dir?: 'up' | 'same' | 'down' | null; wt?: number | null; reps?: number | null }
  > | null;
}

/**
 * Reads and writes one user's health data. Every method takes the userId explicitly;
 * callers get it from CurrentUserService.
 */
@Injectable()
export class HealthDataService {
  constructor(@Inject(DB) private readonly dbh: DbHandle) {}

  private get db() {
    return this.dbh.db;
  }

  /** The whole app snapshot (the original `api/data` document). */
  async snapshot(userId: string, timeZone: string, now = new Date()): Promise<Snapshot> {
    const today = localDate(now, timeZone);
    const since = (days: number) => shiftDate(today, -days);
    const [goals, metrics, weights, mealRows, habitRows, checks, moods, plan, sessions] =
      await Promise.all([
        this.db.select().from(userGoals).where(eq(userGoals.userId, userId)),
        this.db
          .select()
          .from(dailyMetrics)
          .where(and(eq(dailyMetrics.userId, userId), gte(dailyMetrics.date, since(HISTORY_DAYS)))),
        this.db
          .select()
          .from(weightEntries)
          .where(
            and(eq(weightEntries.userId, userId), gte(weightEntries.date, since(HISTORY_DAYS))),
          ),
        this.db
          .select({
            date: meals.date,
            kcal: meals.kcal,
            proteinG: meals.proteinG,
            carbsG: meals.carbsG,
            fatG: meals.fatG,
          })
          .from(meals)
          .where(and(eq(meals.userId, userId), gte(meals.date, since(HISTORY_DAYS)))),
        this.db.select().from(habits).where(eq(habits.userId, userId)),
        this.db
          .select()
          .from(habitChecks)
          .where(and(eq(habitChecks.userId, userId), gte(habitChecks.date, since(HABIT_LOG_DAYS)))),
        this.db
          .select()
          .from(moodEntries)
          .where(and(eq(moodEntries.userId, userId), gte(moodEntries.date, since(MOOD_LOG_DAYS)))),
        this.db.select().from(trainingPlans).where(eq(trainingPlans.userId, userId)),
        this.db
          .select()
          .from(trainingSessions)
          .where(
            and(
              eq(trainingSessions.userId, userId),
              gte(trainingSessions.date, since(TRAINING_LOG_DAYS)),
            ),
          ),
      ]);

    return buildSnapshot({
      now,
      timeZone,
      goals: goals[0] ?? null,
      metrics,
      weights,
      meals: mealRows,
      habits: habitRows,
      habitChecks: checks,
      moods,
      plan: plan[0]?.workouts ?? null,
      sessions,
    });
  }

  async logWeight(userId: string, w: WeightInput): Promise<void> {
    await this.db
      .insert(weightEntries)
      .values({
        userId,
        date: w.date,
        weightLb: Math.round(w.weightLb * 10) / 10,
        source: w.source ?? 'app',
        eventId: w.eventId,
      })
      .onConflictDoNothing();
  }

  async logMood(userId: string, m: MoodInput): Promise<void> {
    await this.db
      .insert(moodEntries)
      .values({
        userId,
        date: m.date,
        mood: m.mood,
        note: cleanNote(m.note),
        eventId: m.eventId,
      })
      .onConflictDoNothing();
  }

  async setHabitCheck(userId: string, c: HabitCheckInput): Promise<void> {
    await this.db
      .insert(habitChecks)
      .values({ userId, date: c.date, habitId: c.habitId, done: c.done })
      .onConflictDoUpdate({
        target: [habitChecks.userId, habitChecks.date, habitChecks.habitId],
        set: { done: c.done, updatedAt: new Date() },
      });
  }

  /** Replaces the habit list (order = position). Check history is kept. */
  async setHabitConfig(userId: string, cfg: HabitConfigInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, h] of cfg.list.entries()) {
        const row = { name: h.n.trim(), position: i, archived: h.a === 1, updatedAt: new Date() };
        await tx
          .insert(habits)
          .values({ userId, id: h.id, ...row })
          .onConflictDoUpdate({ target: [habits.userId, habits.id], set: row });
      }
      const keep = cfg.list.map((h) => h.id);
      await tx.delete(habits).where(and(eq(habits.userId, userId), notInArray(habits.id, keep)));
    });
  }

  async setGoals(userId: string, g: GoalsInput): Promise<void> {
    const row = {
      kcal: Math.round(g.kcal),
      proteinG: Math.round(g.protein),
      goalsSet: true,
      sex: g.sex,
      age: Math.round(g.age),
      heightIn: g.height,
      weightLb: g.weight,
      activity: g.activity,
      goal: g.goal,
      // Only when sent: the original page posts goals without these.
      ...(g.carbs !== undefined && { carbsG: Math.round(g.carbs) }),
      ...(g.fat !== undefined && { fatG: Math.round(g.fat) }),
      ...(g.trackMacros !== undefined && { trackMacros: g.trackMacros }),
      updatedAt: new Date(),
    };
    await this.db
      .insert(userGoals)
      .values({ userId, ...row })
      .onConflictDoUpdate({ target: userGoals.userId, set: row });
  }

  async setPlan(userId: string, p: PlanInput): Promise<void> {
    const workouts = p.workouts.map((w) => ({
      name: w.name.trim(),
      ex: w.ex.map((x) => ({ n: x.n.trim(), sets: (x.sets ?? '').trim(), star: x.star })),
    }));
    await this.db
      .insert(trainingPlans)
      .values({ userId, workouts })
      .onConflictDoUpdate({
        target: trainingPlans.userId,
        set: { workouts, updatedAt: new Date() },
      });
  }

  async logTraining(userId: string, t: TrainingInput): Promise<void> {
    await this.db
      .insert(trainingSessions)
      .values({
        userId,
        date: t.date,
        workout: t.workout?.trim() || null,
        status: t.status,
        lifts: t.lifts ?? {},
        eventId: t.eventId,
      })
      .onConflictDoNothing();
  }
}

/** Replace control characters with spaces, collapse whitespace, cap at 200 chars (as the original did). */
function cleanNote(note: string | null | undefined): string {
  const visible = Array.from(note ?? '', (c) => {
    const code = c.charCodeAt(0);
    return code < 0x20 && code !== 0x09 && code !== 0x0a ? ' ' : c;
  }).join('');
  return visible
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, 200);
}
