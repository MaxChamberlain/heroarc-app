import type { ImportSummary } from '@heroarc/contracts';
import { and, type DbHandle, eq, like, schema } from '@heroarc/db';
import {
  type LegacyCell,
  type LegacyImport,
  type LegacyTab,
  readLegacyWorkbook,
  zonedInstant,
} from '@heroarc/domain';
import { Inject, Injectable } from '@nestjs/common';
import readXlsxFile from 'read-excel-file/node';
import { DB } from '../infra/tokens.js';

const {
  habitChecks,
  habits,
  meals,
  moodEntries,
  trainingPlans,
  trainingSessions,
  userGoals,
  weightEntries,
} = schema;

/** A file we can't import; the message says why. */
export class ImportError extends Error {}

const EPOCH = Date.UTC(1899, 11, 30);
/** Dates come back as Date objects; turn them into day serials, as the original sheet stored them. */
const cell = (v: unknown): LegacyCell =>
  v instanceof Date
    ? (v.getTime() - EPOCH) / 86_400_000
    : typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      ? v
      : null;

const CHUNK = 500;
const chunks = <T>(xs: T[]) =>
  Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) =>
    xs.slice(i * CHUNK, (i + 1) * CHUNK),
  );
const fmt = (n: number) => n.toLocaleString('en-US');

/** What's already in the account: imported keys per kind, habit ticks, habits, goals, plan. */
interface Existing {
  keys: Set<string>;
  checks: Set<string>;
  habits: Set<string>;
  goalsSet: boolean;
  hasPlan: boolean;
}

/**
 * Imports the original HeroArc's Google Sheet (as .xlsx) into one account. The mapping is in
 * @heroarc/domain (readLegacyWorkbook); this reads the file and writes the rows. Imported
 * entries carry "legacy:…" event ids, so a second import skips them. Goals and the training
 * plan are only taken from the sheet if the account doesn't have its own yet.
 */
@Injectable()
export class LegacyImportService {
  constructor(@Inject(DB) private readonly dbh: DbHandle) {}

  private get db() {
    return this.dbh.db;
  }

  async read(file: Blob): Promise<LegacyImport> {
    let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
    try {
      sheets = await readXlsxFile(Buffer.from(await file.arrayBuffer()));
    } catch {
      throw new ImportError(
        "That file isn't a spreadsheet HeroArc can read. In Google Sheets, use File → Download → Microsoft Excel (.xlsx).",
      );
    }
    const data = readLegacyWorkbook(
      Object.fromEntries(sheets.map((s) => [s.sheet, s.data.map((row) => row.map(cell))])),
    );
    if (!data.found.length)
      throw new ImportError(
        "This doesn't look like the old HeroArc sheet: it has none of its tabs (Nutrition Log, Weight Log, Training Log, Mood Log…).",
      );
    return data;
  }

  private async existing(userId: string): Promise<Existing> {
    const legacy = <T extends { userId: unknown; eventId: unknown }>(t: T) =>
      and(eq(t.userId as never, userId), like(t.eventId as never, 'legacy:%'));
    const [m, w, s, md, c, h, [g], [p]] = await Promise.all([
      this.db.select({ k: meals.eventId }).from(meals).where(legacy(meals)),
      this.db.select({ k: weightEntries.eventId }).from(weightEntries).where(legacy(weightEntries)),
      this.db
        .select({ k: trainingSessions.eventId })
        .from(trainingSessions)
        .where(legacy(trainingSessions)),
      this.db.select({ k: moodEntries.eventId }).from(moodEntries).where(legacy(moodEntries)),
      this.db
        .select({ d: habitChecks.date, h: habitChecks.habitId })
        .from(habitChecks)
        .where(eq(habitChecks.userId, userId)),
      this.db.select({ id: habits.id }).from(habits).where(eq(habits.userId, userId)),
      this.db
        .select({ set: userGoals.goalsSet })
        .from(userGoals)
        .where(eq(userGoals.userId, userId)),
      this.db
        .select({ u: trainingPlans.userId })
        .from(trainingPlans)
        .where(eq(trainingPlans.userId, userId)),
    ]);
    return {
      keys: new Set([...m, ...w, ...s, ...md].map((r) => r.k as string)),
      checks: new Set(c.map((r) => `${r.d}|${r.h}`)),
      habits: new Set(h.map((r) => r.id)),
      goalsSet: !!g?.set,
      hasPlan: !!p,
    };
  }

  /** Per-tab counts, with `added` giving each tab's new (preview) or added (import) entries. */
  private summary(
    data: LegacyImport,
    ex: Existing,
    added: Partial<Record<LegacyTab, number>>,
  ): ImportSummary {
    const notes: string[] = [];
    if (data.goals)
      notes.push(
        ex.goalsSet
          ? 'Your goals in HeroArc are kept; the old sheet’s aren’t used.'
          : `Goals from the old sheet: ${[
              data.goals.kcal && `${fmt(data.goals.kcal)} kcal`,
              data.goals.protein && `${data.goals.protein} g protein`,
              data.goals.steps && `${fmt(data.goals.steps)} steps`,
              data.goals.activeKcal && `${data.goals.activeKcal} active kcal`,
            ]
              .filter(Boolean)
              .join(', ')}.`,
      );
    if (data.plan)
      notes.push(
        ex.hasPlan
          ? 'Your training plan in HeroArc is kept; the old sheet’s isn’t used.'
          : `Training plan from the old sheet: ${data.plan.map((w) => w.name).join(', ')}.`,
      );
    notes.push(
      "Oura history (sleep, readiness, steps…) isn't imported: it comes from Oura once you connect it.",
    );
    const tabs = data.report.map((r) => ({ ...r, new: added[r.tab] ?? 0 }));
    return { tabs, notes, total: tabs.reduce((a, t) => a + t.new, 0) };
  }

  /** What an import would add. Writes nothing. */
  async preview(userId: string, file: Blob): Promise<ImportSummary> {
    const data = await this.read(file);
    const ex = await this.existing(userId);
    const fresh = (xs: Array<{ key: string }>) => xs.filter((x) => !ex.keys.has(x.key)).length;
    return this.summary(data, ex, {
      Settings: data.goals && !ex.goalsSet ? 1 : 0,
      'Nutrition Log': fresh(data.meals),
      'Weight Log': fresh(data.weights),
      'Training Log': fresh(data.sessions),
      Plan: data.plan && !ex.hasPlan ? data.plan.reduce((a, w) => a + w.ex.length, 0) : 0,
      Habits: data.habits.filter((h) => !ex.habits.has(h.id)).length,
      'Habit Log': data.habitChecks.filter((c) => !ex.checks.has(`${c.date}|${c.habitId}`)).length,
      'Mood Log': fresh(data.moods),
    });
  }

  /** Import into the account, in one transaction. Entries already there are skipped. */
  async run(userId: string, timeZone: string, file: Blob): Promise<ImportSummary> {
    const data = await this.read(file);
    const ex = await this.existing(userId);
    const at = (date: string, time: string, plusMs = 0) =>
      new Date(zonedInstant(date, time, timeZone).getTime() + plusMs);
    const added: Partial<Record<LegacyTab, number>> = {};

    await this.db.transaction(async (tx) => {
      const insert = async (
        tab: LegacyTab,
        table: typeof meals | typeof weightEntries | typeof trainingSessions | typeof moodEntries,
        rows: Record<string, unknown>[],
      ) => {
        let n = 0;
        for (const part of chunks(rows)) {
          const done = await tx
            .insert(table)
            .values(part as never)
            .onConflictDoNothing()
            .returning({ id: table.id });
          n += done.length;
        }
        added[tab] = n;
      };

      await insert(
        'Nutrition Log',
        meals,
        data.meals.map((m, i) => ({
          userId,
          date: m.date,
          time: m.time,
          meal: m.meal,
          items: m.items,
          kcal: m.kcal,
          proteinG: m.protein,
          carbsG: m.carbs,
          fatG: m.fat,
          confidence: m.confidence,
          source: m.source,
          notes: m.notes,
          createdBy: 'import',
          eventId: m.key,
          // In the day's order, at the meal's own time (never "now": that would reorder today).
          createdAt: at(m.date, m.time ?? '12:00', i),
        })),
      );
      await insert(
        'Weight Log',
        weightEntries,
        data.weights.map((w, i) => ({
          userId,
          date: w.date,
          weightLb: w.lb,
          source: 'import',
          eventId: w.key,
          createdAt: at(w.date, '07:00', i),
        })),
      );
      await insert(
        'Training Log',
        trainingSessions,
        data.sessions.map((s) => ({
          userId,
          date: s.date,
          workout: s.workout,
          status: s.status,
          lifts: s.lifts,
          loggedAt: at(s.loggedAt.date, s.loggedAt.time),
          eventId: s.key,
        })),
      );
      await insert(
        'Mood Log',
        moodEntries,
        data.moods.map((m) => ({
          userId,
          date: m.date,
          mood: m.mood,
          note: m.note,
          loggedAt: at(m.loggedAt.date, m.loggedAt.time),
          eventId: m.key,
        })),
      );

      // Habits: add the ones the account doesn't have (its own list and names win).
      const newHabits = data.habits.filter((h) => !ex.habits.has(h.id));
      const base = ex.habits.size;
      for (const part of chunks(newHabits))
        await tx
          .insert(habits)
          .values(
            part.map((h, i) => ({
              userId,
              id: h.id,
              name: h.name,
              position: base + i,
              // Only add visible habits while there's room (the board shows at most 8).
              archived: h.archived || base + i >= 8,
            })),
          )
          .onConflictDoNothing();
      added.Habits = newHabits.length;
      // Ticks: a day already ticked in HeroArc keeps its own answer.
      let ticks = 0;
      for (const part of chunks(data.habitChecks)) {
        const done = await tx
          .insert(habitChecks)
          .values(part.map((c) => ({ userId, date: c.date, habitId: c.habitId, done: c.done })))
          .onConflictDoNothing()
          .returning({ d: habitChecks.date });
        ticks += done.length;
      }
      added['Habit Log'] = ticks;

      if (data.goals && !ex.goalsSet) {
        const g = data.goals;
        const values = {
          ...(g.kcal != null && { kcal: g.kcal }),
          ...(g.protein != null && { proteinG: g.protein }),
          ...(g.steps != null && { steps: g.steps }),
          ...(g.activeKcal != null && { activeKcal: g.activeKcal }),
          goalsSet: g.goalsSet,
        };
        await tx
          .insert(userGoals)
          .values({ userId, kcal: g.kcal ?? 2200, proteinG: g.protein ?? 150, ...values })
          .onConflictDoUpdate({
            target: userGoals.userId,
            set: { ...values, updatedAt: new Date() },
          });
        added.Settings = 1;
      }
      if (data.plan && !ex.hasPlan) {
        await tx
          .insert(trainingPlans)
          .values({ userId, workouts: data.plan })
          .onConflictDoNothing();
        added.Plan = data.plan.reduce((a, w) => a + w.ex.length, 0);
      }
    });
    return this.summary(data, ex, added);
  }
}
