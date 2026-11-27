import {
  type AppAction,
  CARD_TITLES,
  type CardId,
  type Layout,
  type Receipt,
} from '@heroarc/contracts';
import {
  and,
  asc,
  type Database,
  type DbHandle,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  schema,
  sql,
} from '@heroarc/db';
import {
  DEFAULT_GOALS,
  DEFAULT_LAYOUT,
  localClock,
  localDate,
  macroSplit,
  normalizeLayout,
  readingOrder,
  repack,
  shiftDate,
} from '@heroarc/domain';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DB } from '../infra/tokens.js';
import { LayoutService } from '../layout/layout.service.js';
import { isToolName, TOOLS, type ToolInput, type ToolName } from './tools.js';

const {
  agentActions,
  coachAttachments,
  coachNotes,
  habitChecks,
  habits,
  meals,
  moodEntries,
  trainingPlans,
  trainingSessions,
  userGoals,
  weightEntries,
} = schema;

/** Who is acting, for whom, and when. */
export interface AgentContext {
  userId: string;
  timeZone: string;
  /** 'coach', or 'agent:<name>' for an outside agent. */
  actor: string;
  chatId?: string;
  /** The outside agent's connection (agent_keys id). */
  connectionId?: string;
  now?: Date;
}

export type Changed = Array<'data' | 'layout' | 'notes'>;

/** After Apply / Cancel / Undo: the receipt as it is now, what changed, and its chat. */
export interface ActionOutcome {
  receipt: Receipt;
  changed: Changed;
  chatId: string | null;
}

export interface ToolOutcome {
  /** What the model reads back. */
  result: string;
  isError?: boolean;
  receipt?: Receipt;
  app?: AppAction;
  changed?: Changed;
}

/**
 * Oura's API terms (API and MCP Agreement, June 2026, §4(d), §2(c)) don't allow data from the
 * Oura API to be used as input to any AI model, or passed to other products' AI. So nothing from
 * daily_metrics (sleep, readiness, HRV, steps, calories burned) ever goes into an agent's view:
 * not Coach, not MCP, REST or the Hermes API. Tests check this.
 */
export const WEARABLE_NOTE =
  "Wearable data (sleep, readiness, HRV, heart rate, steps, calories burned) comes from Oura and isn't available to assistants; the user can see it on their dashboard.";

/** A tool input the model got wrong; the message goes back to the model to fix. */
export class ToolInputError extends Error {}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Q = Database | Tx;

/* ------------------------------------------------------------------------------------------ */
/* Undo: what to do to reverse an applied action. Stored as JSON on agent_actions.            */

const UNDO_TABLES = {
  meals,
  weight_entries: weightEntries,
  mood_entries: moodEntries,
  training_sessions: trainingSessions,
  coach_notes: coachNotes,
} as const;
type UndoTable = keyof typeof UNDO_TABLES;

type Undo =
  | { op: 'delete'; table: UndoTable; id: string }
  | { op: 'insert'; table: UndoTable; row: Record<string, unknown> }
  | { op: 'update'; table: UndoTable; id: string; values: Record<string, unknown> }
  | { op: 'habit_check'; date: string; habitId: string; prev: boolean | null }
  | { op: 'goals'; prev: Record<string, unknown> | null }
  | { op: 'habits'; prev: Array<Record<string, unknown>> }
  | { op: 'plan'; prev: unknown[] | null }
  | { op: 'layout'; prev: Layout };

/** JSON turned timestamps into strings; turn them back before writing. */
function revive(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      /At$/.test(k) && typeof v === 'string' ? new Date(v) : v,
    ]),
  );
}

const RECORD_TABLE = {
  meal: 'meals',
  weight: 'weight_entries',
  mood: 'mood_entries',
  training: 'training_sessions',
} as const satisfies Record<string, UndoTable>;
type RecordKind = keyof typeof RECORD_TABLE;

/** Model field names → columns, per record kind (only these may change). */
const EDITABLE: Record<RecordKind, Record<string, string>> = {
  meal: {
    date: 'date',
    time: 'time',
    meal: 'meal',
    items: 'items',
    kcal: 'kcal',
    protein_g: 'proteinG',
    carbs_g: 'carbsG',
    fat_g: 'fatG',
    notes: 'notes',
  },
  weight: { date: 'date', lb: 'weightLb' },
  mood: { date: 'date', mood: 'mood', note: 'note' },
  training: { date: 'date', workout: 'workout', status: 'status', lifts: 'lifts' },
};

const CHANGES: Partial<Record<ToolName, Changed>> = {
  remember: ['notes'],
  forget: ['notes'],
  arrange_dashboard: ['layout'],
};
const changedBy = (tool: string): Changed => CHANGES[tool as ToolName] ?? ['data'];

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function clean(note: string | undefined): string {
  // Control characters (except tab and newline) become spaces.
  const visible = Array.from(note ?? '', (c) => {
    const code = c.charCodeAt(0);
    return code < 0x20 && code !== 0x09 && code !== 0x0a ? ' ' : c;
  }).join('');
  return visible.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function slug(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'habit';
  let id = base;
  let i = 2;
  while (taken.has(id)) id = `${base}-${i++}`;
  taken.add(id);
  return id;
}

/**
 * Runs agent tools for a user: reads, logs (applied with Undo), proposed changes (applied when
 * the user confirms), and app actions. Every write is recorded in agent_actions.
 */
@Injectable()
export class AgentService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    private readonly layouts: LayoutService,
  ) {}

  private get db() {
    return this.dbh.db;
  }

  private today(ctx: AgentContext) {
    return localDate(ctx.now ?? new Date(), ctx.timeZone);
  }

  /** Today's date in the user's timezone. */
  todayFor(ctx: AgentContext): string {
    return this.today(ctx);
  }

  private dayLabel(ctx: AgentContext, d: string): string {
    const today = this.today(ctx);
    if (d === today) return 'today';
    if (d === shiftDate(today, -1)) return 'yesterday';
    return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  private day(ctx: AgentContext, d: string | undefined): string {
    const day = d ?? this.today(ctx);
    if (day > this.today(ctx)) throw new ToolInputError(`${day} is in the future.`);
    return day;
  }

  /** Run one tool call. Bad input comes back as an error result for the model to fix. */
  async run(ctx: AgentContext, name: string, raw: unknown): Promise<ToolOutcome> {
    if (!isToolName(name)) return { result: `Unknown tool ${name}.`, isError: true };
    const def = TOOLS[name];
    const parsed = def.input.safeParse(raw ?? {});
    if (!parsed.success)
      return {
        result: `Invalid input for ${name}:\n${z.prettifyError(parsed.error)}`,
        isError: true,
      };
    try {
      if (def.kind === 'change') return await this.propose(ctx, name, parsed.data);
      return await this.exec(ctx, name, parsed.data as never);
    } catch (e) {
      if (e instanceof ToolInputError) return { result: e.message, isError: true };
      throw e;
    }
  }

  private async exec<N extends ToolName>(
    ctx: AgentContext,
    name: N,
    input: ToolInput<N>,
  ): Promise<ToolOutcome> {
    switch (name) {
      case 'get_day':
        return {
          result: JSON.stringify(await this.getDay(ctx, (input as ToolInput<'get_day'>).date)),
        };
      case 'get_range': {
        const i = input as ToolInput<'get_range'>;
        return { result: JSON.stringify(await this.getRange(ctx, i.from, i.to)) };
      }
      case 'get_setup':
        return { result: JSON.stringify(await this.getSetup(ctx)) };
      case 'show_day': {
        const d = this.day(ctx, (input as ToolInput<'show_day'>).date);
        return { result: `The dashboard now shows ${d}.`, app: { kind: 'show_day', date: d } };
      }
      case 'set_theme': {
        const t = (input as ToolInput<'set_theme'>).theme;
        return {
          result: `Theme switched to ${t} on this device.`,
          app: { kind: 'set_theme', theme: t },
        };
      }
      case 'open_card': {
        const i = input as ToolInput<'open_card'>;
        return {
          result: `Opened the ${i.card} card${i.view ? ` (${i.view})` : ''}.`,
          app: { kind: 'open_card', card: i.card, ...(i.view && { view: i.view }) },
        };
      }
      default:
        return this.db.transaction(async (tx) => {
          const { summary, undo } = await this.log(tx, ctx, name, input as never);
          const receipt = await this.record(tx, ctx, name, input, summary, 'applied', undo);
          return {
            result: `Done: ${summary}. (Undo is available to the user.)`,
            receipt,
            changed: changedBy(name),
          };
        });
    }
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Reads                                                                                     */

  async getDay(ctx: AgentContext, date: string) {
    const u = ctx.userId;
    const [ms, ws, moods, hs, checks, ts] = await Promise.all([
      this.db
        .select()
        .from(meals)
        .where(and(eq(meals.userId, u), eq(meals.date, date)))
        .orderBy(asc(meals.time), asc(meals.createdAt)),
      this.db
        .select()
        .from(weightEntries)
        .where(and(eq(weightEntries.userId, u), eq(weightEntries.date, date)))
        .orderBy(asc(weightEntries.createdAt)),
      this.db
        .select()
        .from(moodEntries)
        .where(and(eq(moodEntries.userId, u), eq(moodEntries.date, date)))
        .orderBy(asc(moodEntries.loggedAt)),
      this.db.select().from(habits).where(eq(habits.userId, u)).orderBy(asc(habits.position)),
      this.db
        .select()
        .from(habitChecks)
        .where(and(eq(habitChecks.userId, u), eq(habitChecks.date, date))),
      this.db
        .select()
        .from(trainingSessions)
        .where(and(eq(trainingSessions.userId, u), eq(trainingSessions.date, date)))
        .orderBy(desc(trainingSessions.loggedAt)),
    ]);
    const done = new Set(checks.filter((c) => c.done).map((c) => c.habitId));
    const clock = (d: Date) => localClock(d, ctx.timeZone);
    return {
      date,
      wearable: WEARABLE_NOTE,
      meals: ms.map((x) => ({
        id: x.id,
        time: x.time,
        meal: x.meal,
        items: x.items,
        kcal: x.kcal,
        protein_g: x.proteinG,
        carbs_g: x.carbsG,
        fat_g: x.fatG,
        confidence: x.confidence,
        has_photo: !!x.photoId,
      })),
      weigh_ins: ws.map((x) => ({ id: x.id, lb: x.weightLb, at: clock(x.createdAt) })),
      moods: moods.map((x) => ({
        id: x.id,
        mood: x.mood,
        note: x.note || undefined,
        at: clock(x.loggedAt),
      })),
      habits: hs
        .filter((h) => !h.archived)
        .map((h) => ({ id: h.id, name: h.name, done: done.has(h.id) })),
      training: ts.map((x, i) => ({
        id: x.id,
        workout: x.workout,
        status: x.status,
        lifts: x.lifts,
        current: i === 0,
      })),
    };
  }

  async getRange(ctx: AgentContext, from: string, to: string) {
    if (from > to) throw new ToolInputError('from must be on or before to.');
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5 + 1;
    if (span > 400) throw new ToolInputError('At most 400 days at a time.');
    const u = ctx.userId;
    const [ml, ws, mo, hs, ch, ts] = await Promise.all([
      this.db
        .select({
          date: meals.date,
          kcal: meals.kcal,
          p: meals.proteinG,
          c: meals.carbsG,
          f: meals.fatG,
        })
        .from(meals)
        .where(and(eq(meals.userId, u), gte(meals.date, from), lte(meals.date, to))),
      this.db
        .select({
          date: weightEntries.date,
          lb: weightEntries.weightLb,
          at: weightEntries.createdAt,
        })
        .from(weightEntries)
        .where(
          and(
            eq(weightEntries.userId, u),
            gte(weightEntries.date, from),
            lte(weightEntries.date, to),
          ),
        ),
      this.db
        .select({ date: moodEntries.date, m: moodEntries.mood })
        .from(moodEntries)
        .where(
          and(eq(moodEntries.userId, u), gte(moodEntries.date, from), lte(moodEntries.date, to)),
        ),
      this.db
        .select()
        .from(habits)
        .where(and(eq(habits.userId, u), eq(habits.archived, false))),
      this.db
        .select()
        .from(habitChecks)
        .where(
          and(eq(habitChecks.userId, u), gte(habitChecks.date, from), lte(habitChecks.date, to)),
        ),
      this.db
        .select()
        .from(trainingSessions)
        .where(
          and(
            eq(trainingSessions.userId, u),
            gte(trainingSessions.date, from),
            lte(trainingSessions.date, to),
          ),
        )
        .orderBy(asc(trainingSessions.loggedAt)),
    ]);
    type Row = Record<string, number | string | null | undefined>;
    const days = new Map<string, Row>();
    const row = (d: string) => {
      let r = days.get(d);
      if (!r) {
        r = { date: d };
        days.set(d, r);
      }
      return r;
    };
    for (const m of ml) {
      const r = row(m.date);
      r.kcal_in = Math.round(Number(r.kcal_in ?? 0) + m.kcal);
      r.protein_g = Math.round(Number(r.protein_g ?? 0) + m.p);
      if (m.c != null) r.carbs_g = Math.round(Number(r.carbs_g ?? 0) + m.c);
      if (m.f != null) r.fat_g = Math.round(Number(r.fat_g ?? 0) + m.f);
    }
    const latestW = new Map<string, { lb: number; at: Date }>();
    for (const w of ws) {
      const cur = latestW.get(w.date);
      if (!cur || w.at > cur.at) latestW.set(w.date, { lb: w.lb, at: w.at });
    }
    for (const [d, w] of latestW) row(d).weight_lb = w.lb;
    const moodSum = new Map<string, number[]>();
    for (const m of mo) moodSum.set(m.date, [...(moodSum.get(m.date) ?? []), m.m]);
    for (const [d, v] of moodSum) row(d).mood_avg = round1(v.reduce((a, b) => a + b, 0) / v.length);
    const active = new Set(hs.map((h) => h.id));
    for (const c of ch)
      if (c.done && active.has(c.habitId)) {
        const r = row(c.date);
        r.habits_done = Number(r.habits_done ?? 0) + 1;
      }
    for (const t of ts)
      Object.assign(row(t.date), { training: t.status, workout: t.workout ?? undefined });
    return {
      from,
      to,
      wearable: WEARABLE_NOTE,
      habits_total: active.size,
      days: [...days.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    };
  }

  /**
   * Today's totals and goals, shaped like the original API's GET /today (Hermes). Wearable
   * fields are null: Oura data never goes to agents (see WEARABLE_NOTE).
   */
  async todayTotals(ctx: AgentContext) {
    const now = ctx.now ?? new Date();
    const date = this.today(ctx);
    const [day, setup, [w]] = await Promise.all([
      this.getDay(ctx, date),
      this.getSetup(ctx),
      this.db
        .select({ lb: weightEntries.weightLb })
        .from(weightEntries)
        .where(and(eq(weightEntries.userId, ctx.userId), lte(weightEntries.date, date)))
        .orderBy(desc(weightEntries.date), desc(weightEntries.createdAt))
        .limit(1),
    ]);
    const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') =>
      day.meals.some((m) => m[k] != null)
        ? Math.round(day.meals.reduce((a, m) => a + (m[k] ?? 0), 0))
        : null;
    const g = setup.goals;
    const split = macroSplit(g.kcal, g.protein_g);
    return {
      date,
      updated: localClock(now, ctx.timeZone),
      goals: {
        steps: g.steps,
        activeKcal: g.active_kcal,
        kcal: g.kcal,
        protein: g.protein_g,
        carbs: g.carbs_g ?? split.carbs,
        fat: g.fat_g ?? split.fat,
        trackMacros: g.track_macros,
        goalsSet: g.set_by_user,
      },
      today: {
        steps: null,
        stepsGoal: g.steps,
        activeKcal: null,
        totalKcal: null,
        activeGoal: g.active_kcal,
        kcalIn: sum('kcal') ?? 0,
        kcalTarget: g.kcal,
        protein: sum('protein_g') ?? 0,
        proteinTarget: g.protein_g,
        carbs: sum('carbs_g'),
        fat: sum('fat_g'),
        readiness: null,
        sleep: null,
        sleepHours: null,
        hrv: null,
        rhr: null,
        bed: null,
        wake: null,
        weight: w?.lb ?? null,
      },
      ouraDay: null,
      wearable: WEARABLE_NOTE,
    };
  }

  async getSetup(ctx: AgentContext) {
    const u = ctx.userId;
    const [[g], hs, [plan], layout] = await Promise.all([
      this.db.select().from(userGoals).where(eq(userGoals.userId, u)),
      this.db.select().from(habits).where(eq(habits.userId, u)).orderBy(asc(habits.position)),
      this.db.select().from(trainingPlans).where(eq(trainingPlans.userId, u)),
      this.layouts.get(u),
    ]);
    return {
      goals: {
        kcal: g?.kcal ?? DEFAULT_GOALS.kcal,
        protein_g: g?.proteinG ?? DEFAULT_GOALS.protein,
        carbs_g: g?.carbsG ?? null,
        fat_g: g?.fatG ?? null,
        track_macros: g?.trackMacros ?? false,
        steps: g?.steps ?? DEFAULT_GOALS.steps,
        active_kcal: g?.activeKcal ?? DEFAULT_GOALS.activeKcal,
        set_by_user: g?.goalsSet ?? false,
      },
      habits: hs.map((h) => ({ id: h.id, name: h.name, hidden: h.archived })),
      training_plan: (plan?.workouts ?? []).map((w) => ({
        name: w.name,
        exercises: w.ex.map((x) => ({ name: x.n, sets: x.sets, key_lift: x.star === 1 })),
      })),
      dashboard: {
        cards_in_order: readingOrder(layout.tiles).map((t) => ({
          card: t.id,
          x: t.x,
          y: t.y,
          w: t.w,
          h: t.h,
        })),
        hidden: layout.tiles.filter((t) => t.hidden).map((t) => t.id),
      },
    };
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Logs: applied at once                                                                     */

  private async log(
    tx: Tx,
    ctx: AgentContext,
    name: ToolName,
    input: Record<string, never>,
  ): Promise<{ summary: string; undo: Undo }> {
    const u = ctx.userId;
    switch (name) {
      case 'log_meal': {
        const i = input as unknown as ToolInput<'log_meal'>;
        const date = this.day(ctx, i.date);
        if (i.photo_id) {
          const [p] = await tx
            .select({ id: coachAttachments.id })
            .from(coachAttachments)
            .where(and(eq(coachAttachments.userId, u), eq(coachAttachments.id, i.photo_id)));
          if (!p) throw new ToolInputError('That photo_id is not one of the photos the user sent.');
        }
        const [row] = await tx
          .insert(meals)
          .values({
            userId: u,
            date,
            time: i.time ?? null,
            meal: i.meal,
            items: i.items,
            kcal: Math.round(i.kcal),
            proteinG: Math.round(i.protein_g),
            carbsG: i.carbs_g == null ? null : Math.round(i.carbs_g),
            fatG: i.fat_g == null ? null : Math.round(i.fat_g),
            confidence: i.confidence ?? null,
            source: i.photo_id ? 'photo estimate' : ctx.actor,
            notes: i.notes ?? null,
            createdBy: ctx.actor,
            photoId: i.photo_id ?? null,
          })
          .returning({ id: meals.id });
        return {
          summary: `Logged ${i.meal.toLowerCase()} (${this.dayLabel(ctx, date)}): ${i.items} · ${fmt(i.kcal)} kcal, ${fmt(i.protein_g)} g protein`,
          undo: { op: 'delete', table: 'meals', id: row?.id as string },
        };
      }
      case 'log_weight': {
        const i = input as unknown as ToolInput<'log_weight'>;
        const date = this.day(ctx, i.date);
        const [row] = await tx
          .insert(weightEntries)
          .values({ userId: u, date, weightLb: round1(i.lb), source: ctx.actor })
          .returning({ id: weightEntries.id });
        return {
          summary: `Logged ${round1(i.lb).toFixed(1)} lb (${this.dayLabel(ctx, date)})`,
          undo: { op: 'delete', table: 'weight_entries', id: row?.id as string },
        };
      }
      case 'log_mood': {
        const i = input as unknown as ToolInput<'log_mood'>;
        const note = clean(i.note);
        const [row] = await tx
          .insert(moodEntries)
          .values({ userId: u, date: this.today(ctx), mood: i.mood, note })
          .returning({ id: moodEntries.id });
        return {
          summary: `Logged mood ${i.mood}/5${note ? `: "${note}"` : ''}`,
          undo: { op: 'delete', table: 'mood_entries', id: row?.id as string },
        };
      }
      case 'set_habit': {
        const i = input as unknown as ToolInput<'set_habit'>;
        const date = this.day(ctx, i.date);
        const [h] = await tx
          .select()
          .from(habits)
          .where(and(eq(habits.userId, u), eq(habits.id, i.habit_id)));
        if (!h) throw new ToolInputError(`No habit with id ${i.habit_id}; get ids from get_setup.`);
        const [prev] = await tx
          .select()
          .from(habitChecks)
          .where(
            and(
              eq(habitChecks.userId, u),
              eq(habitChecks.date, date),
              eq(habitChecks.habitId, h.id),
            ),
          );
        await tx
          .insert(habitChecks)
          .values({ userId: u, date, habitId: h.id, done: i.done })
          .onConflictDoUpdate({
            target: [habitChecks.userId, habitChecks.date, habitChecks.habitId],
            set: { done: i.done, updatedAt: new Date() },
          });
        return {
          summary: `${i.done ? 'Ticked' : 'Unticked'} ${h.name} (${this.dayLabel(ctx, date)})`,
          undo: { op: 'habit_check', date, habitId: h.id, prev: prev ? prev.done : null },
        };
      }
      case 'log_training': {
        const i = input as unknown as ToolInput<'log_training'>;
        const date = this.day(ctx, i.date);
        const lifts = await this.withDirections(tx, u, date, i.lifts ?? {});
        const workout = i.status === 'rest' ? null : (i.workout?.trim() ?? null);
        const [row] = await tx
          .insert(trainingSessions)
          .values({ userId: u, date, workout, status: i.status, lifts })
          .returning({ id: trainingSessions.id });
        const what =
          i.status === 'rest'
            ? 'a rest day'
            : `${workout ?? 'a workout'} (${i.status === 'done' ? 'completed' : 'partial'})`;
        const maxes = Object.entries(lifts)
          .map(([k, v]) => `${k} ${v.wt} lb${v.reps ? ` × ${v.reps}` : ''}`)
          .join(', ');
        return {
          summary: `Logged ${what} (${this.dayLabel(ctx, date)})${maxes ? `: ${maxes}` : ''}`,
          undo: { op: 'delete', table: 'training_sessions', id: row?.id as string },
        };
      }
      case 'remember': {
        const i = input as unknown as ToolInput<'remember'>;
        const text = clean(i.text);
        const [row] = await tx
          .insert(coachNotes)
          .values({ userId: u, text })
          .returning({ id: coachNotes.id });
        return {
          summary: `Noted: ${text}`,
          undo: { op: 'delete', table: 'coach_notes', id: row?.id as string },
        };
      }
      case 'forget': {
        const i = input as unknown as ToolInput<'forget'>;
        const [n] = await tx
          .select()
          .from(coachNotes)
          .where(and(eq(coachNotes.userId, u), eq(coachNotes.id, i.note_id)));
        if (!n) throw new ToolInputError('No note with that id.');
        await tx.delete(coachNotes).where(eq(coachNotes.id, n.id));
        return {
          summary: `Forgot: ${n.text}`,
          undo: { op: 'insert', table: 'coach_notes', row: n },
        };
      }
      default:
        throw new Error(`${name} is not a log tool`);
    }
  }

  /** Key lifts get ▲/=/▼ against the last logged max before that day (as the app does). */
  private async withDirections(
    q: Q,
    userId: string,
    date: string,
    lifts: Record<string, { wt: number; reps?: number }>,
  ) {
    const names = Object.keys(lifts);
    if (!names.length) return {};
    const earlier = await q
      .select({ lifts: trainingSessions.lifts })
      .from(trainingSessions)
      .where(and(eq(trainingSessions.userId, userId), lt(trainingSessions.date, date)))
      .orderBy(desc(trainingSessions.date), desc(trainingSessions.loggedAt))
      .limit(200);
    const out: Record<
      string,
      { wt: number; reps: number | null; dir: 'up' | 'same' | 'down' | null }
    > = {};
    for (const n of names) {
      const v = lifts[n] as { wt: number; reps?: number };
      const last = earlier.find((e) => e.lifts?.[n]?.wt != null)?.lifts[n]?.wt;
      out[n] = {
        wt: v.wt,
        reps: v.reps ?? null,
        dir: last == null ? null : v.wt > last ? 'up' : v.wt < last ? 'down' : 'same',
      };
    }
    return out;
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Changes: proposed, applied when the user confirms                                         */

  private async propose(
    ctx: AgentContext,
    name: ToolName,
    input: Record<string, unknown>,
  ): Promise<ToolOutcome> {
    const summary = await this.describe(ctx, name, input);
    const receipt = await this.record(this.db, ctx, name, input, summary, 'pending', null);
    return {
      result: `Proposed (not applied yet): ${summary}. The user now sees Apply / Cancel; don't say it's done.`,
      receipt,
    };
  }

  private async describe(
    ctx: AgentContext,
    name: ToolName,
    input: Record<string, unknown>,
  ): Promise<string> {
    const u = ctx.userId;
    switch (name) {
      case 'edit_record': {
        const i = input as ToolInput<'edit_record'>;
        const row = await this.findRecord(this.db, u, i.kind, i.id);
        const cols = EDITABLE[i.kind];
        const bad = Object.keys(i.changes).filter((k) => !(k in cols));
        if (bad.length) throw new ToolInputError(`A ${i.kind} doesn't have: ${bad.join(', ')}.`);
        if (i.changes.date) this.day(ctx, i.changes.date);
        const diffs = Object.entries(i.changes).map(([k, v]) => {
          const before = row[cols[k] as string];
          const show = (x: unknown) =>
            x == null || x === '' ? '—' : typeof x === 'object' ? JSON.stringify(x) : String(x);
          return `${k.replace('_g', '')} ${show(before)} → ${show(v)}`;
        });
        if (!diffs.length) throw new ToolInputError('No changes given.');
        return `Change ${this.describeRecord(ctx, i.kind, row)}: ${diffs.join(', ')}`;
      }
      case 'delete_record': {
        const i = input as ToolInput<'delete_record'>;
        const row = await this.findRecord(this.db, u, i.kind, i.id);
        return `Delete ${this.describeRecord(ctx, i.kind, row)}`;
      }
      case 'set_goals': {
        const i = input as ToolInput<'set_goals'>;
        const parts = [
          i.kcal != null && `${fmt(i.kcal)} kcal`,
          i.protein_g != null && `${fmt(i.protein_g)} g protein`,
          i.carbs_g != null && `${fmt(i.carbs_g)} g carbs`,
          i.fat_g != null && `${fmt(i.fat_g)} g fat`,
          i.steps != null && `${fmt(i.steps)} steps`,
          i.active_kcal != null && `${fmt(i.active_kcal)} active kcal`,
          i.track_macros != null && (i.track_macros ? 'show fat & carbs' : 'hide fat & carbs'),
        ].filter(Boolean);
        if (!parts.length) throw new ToolInputError('No goals given.');
        return `Set goals: ${parts.join(' · ')}`;
      }
      case 'edit_habits': {
        const i = input as ToolInput<'edit_habits'>;
        const current = await this.db.select().from(habits).where(eq(habits.userId, u));
        const byId = new Map(current.map((h) => [h.id, h]));
        const unknown = i.habits.filter((h) => h.id && !byId.has(h.id));
        if (unknown.length)
          throw new ToolInputError(`Unknown habit ids: ${unknown.map((h) => h.id).join(', ')}.`);
        const visible = i.habits.filter((h) => !h.hidden);
        if (visible.length > 8) throw new ToolInputError('At most 8 visible habits.');
        if (!visible.length) throw new ToolInputError('Keep at least one habit visible.');
        const kept = new Set(i.habits.map((h) => h.id).filter(Boolean));
        const dropped = current.filter((h) => !h.archived && !kept.has(h.id)).map((h) => h.name);
        const names = visible.map((h) => {
          const prev = h.id ? byId.get(h.id) : undefined;
          return prev
            ? prev.name !== h.name
              ? `${prev.name} → ${h.name}`
              : h.name
            : `${h.name} (new)`;
        });
        const hidden = [...i.habits.filter((h) => h.hidden).map((h) => h.name), ...dropped];
        return `Habits: ${names.join(', ')}${hidden.length ? `; hide ${hidden.join(', ')}` : ''}`;
      }
      case 'edit_plan': {
        const i = input as ToolInput<'edit_plan'>;
        const names = new Set<string>();
        for (const w of i.workouts) {
          const k = w.name.trim().toLowerCase();
          if (names.has(k)) throw new ToolInputError(`Two workouts are called ${w.name}.`);
          names.add(k);
          if (w.exercises.filter((x) => x.key_lift).length > 8)
            throw new ToolInputError(`${w.name}: at most 8 key lifts.`);
        }
        return `Training plan: ${i.workouts.map((w) => `${w.name} (${w.exercises.length} exercises)`).join(', ')}`;
      }
      case 'arrange_dashboard': {
        const i = input as ToolInput<'arrange_dashboard'>;
        const before = await this.layouts.get(u);
        const after = this.arrange(before, i);
        return `Rearrange the dashboard: ${this.describeLayoutChange(before, after)}`;
      }
      default:
        throw new Error(`${name} is not a change tool`);
    }
  }

  private describeRecord(
    ctx: AgentContext,
    kind: RecordKind,
    row: Record<string, unknown>,
  ): string {
    const when = this.dayLabel(ctx, String(row.date));
    const from = when === 'today' || when === 'yesterday' ? when : `on ${when}`;
    switch (kind) {
      case 'meal':
        return `${String(row.meal).toLowerCase()} ${from} (${row.items}, ${fmt(Number(row.kcal))} kcal)`;
      case 'weight':
        return `the weigh-in ${from} (${Number(row.weightLb).toFixed(1)} lb)`;
      case 'mood':
        return `the mood check-in ${from} (${row.mood}/5)`;
      case 'training':
        return `training ${from} (${row.status === 'rest' ? 'rest day' : `${row.workout ?? 'workout'}, ${row.status}`})`;
    }
  }

  private async findRecord(
    q: Q,
    userId: string,
    kind: RecordKind,
    id: string,
  ): Promise<Record<string, unknown>> {
    const t = UNDO_TABLES[RECORD_TABLE[kind]] as typeof meals;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ToolInputError(`No ${kind} with id ${id}.`);
    const [row] = await q
      .select()
      .from(t)
      .where(and(eq(t.userId, userId), eq(t.id, id)));
    if (!row) throw new ToolInputError(`No ${kind} with id ${id}; find ids with get_day.`);
    return row as Record<string, unknown>;
  }

  /** The layout a dashboard request leads to (from the layout as it is now). */
  private arrange(current: Layout, i: ToolInput<'arrange_dashboard'>): Layout {
    let tiles = (i.reset ? structuredClone(DEFAULT_LAYOUT) : structuredClone(current)).tiles;
    for (const c of i.tiles ?? []) {
      tiles = tiles.map((t) =>
        t.id === c.card
          ? {
              ...t,
              ...(c.x != null && { x: c.x }),
              ...(c.y != null && { y: c.y }),
              ...(c.w != null && { w: c.w }),
              ...(c.h != null && { h: c.h }),
              ...(c.hidden != null && { hidden: c.hidden }),
            }
          : t,
      );
    }
    if (i.order?.length) {
      const order = [...new Set(i.order)];
      tiles = tiles.map((t) => (order.includes(t.id) ? { ...t, hidden: false } : t));
      const rest = readingOrder(tiles)
        .map((t) => t.id)
        .filter((id) => !order.includes(id));
      tiles = repack([...order, ...rest], tiles);
    }
    return normalizeLayout({ version: 1, cols: 12, tiles });
  }

  private describeLayoutChange(before: Layout, after: Layout): string {
    const parts: string[] = [];
    const b = new Map(before.tiles.map((t) => [t.id, t]));
    const name = (id: CardId) => CARD_TITLES[id];
    const hide = after.tiles.filter((t) => t.hidden && !b.get(t.id)?.hidden).map((t) => name(t.id));
    const show = after.tiles.filter((t) => !t.hidden && b.get(t.id)?.hidden).map((t) => name(t.id));
    const resized = after.tiles
      .filter((t) => {
        const o = b.get(t.id);
        return o && !t.hidden && (o.w !== t.w || o.h !== t.h);
      })
      .map((t) => `${name(t.id)} to ${t.w}×${t.h}`);
    if (hide.length) parts.push(`hide ${hide.join(', ')}`);
    if (show.length) parts.push(`show ${show.join(', ')}`);
    if (resized.length) parts.push(`resize ${resized.join(', ')}`);
    const ob = readingOrder(before.tiles).map((t) => t.id);
    const oa = readingOrder(after.tiles).map((t) => t.id);
    if (oa.join() !== ob.filter((id) => oa.includes(id)).join())
      parts.push(`new order: ${oa.map(name).join(', ')}`);
    return parts.join('; ') || 'no visible change';
  }

  /** Apply a confirmed change; returns what to undo. */
  private async applyChange(
    tx: Tx,
    ctx: AgentContext,
    tool: string,
    input: Record<string, unknown>,
  ): Promise<Undo> {
    const u = ctx.userId;
    switch (tool) {
      case 'edit_record': {
        const i = input as ToolInput<'edit_record'>;
        const table = RECORD_TABLE[i.kind];
        const t = UNDO_TABLES[table] as typeof meals;
        const row = await this.findRecord(tx, u, i.kind, i.id);
        const cols = EDITABLE[i.kind];
        const values: Record<string, unknown> = {};
        const prev: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(i.changes)) {
          const col = cols[k] as string;
          prev[col] = row[col];
          values[col] =
            col === 'weightLb' && typeof v === 'number'
              ? round1(v)
              : ['kcal', 'proteinG', 'carbsG', 'fatG'].includes(col) && typeof v === 'number'
                ? Math.round(v)
                : col === 'note'
                  ? clean(v as string)
                  : v;
        }
        if (i.kind === 'training' && i.changes.lifts)
          values.lifts = await this.withDirections(
            tx,
            u,
            String(values.date ?? row.date),
            i.changes.lifts,
          );
        await tx
          .update(t)
          .set(values as never)
          .where(eq(t.id, i.id));
        return { op: 'update', table, id: i.id, values: prev };
      }
      case 'delete_record': {
        const i = input as ToolInput<'delete_record'>;
        const table = RECORD_TABLE[i.kind];
        const t = UNDO_TABLES[table] as typeof meals;
        const row = await this.findRecord(tx, u, i.kind, i.id);
        await tx.delete(t).where(eq(t.id, i.id));
        return { op: 'insert', table, row };
      }
      case 'set_goals': {
        const i = input as ToolInput<'set_goals'>;
        const [prev] = await tx.select().from(userGoals).where(eq(userGoals.userId, u));
        const set = {
          ...(i.kcal != null && { kcal: Math.round(i.kcal) }),
          ...(i.protein_g != null && { proteinG: Math.round(i.protein_g) }),
          ...(i.carbs_g != null && { carbsG: Math.round(i.carbs_g) }),
          ...(i.fat_g != null && { fatG: Math.round(i.fat_g) }),
          ...(i.track_macros != null && { trackMacros: i.track_macros }),
          ...(i.steps != null && { steps: i.steps }),
          ...(i.active_kcal != null && { activeKcal: i.active_kcal }),
          goalsSet: true,
          updatedAt: new Date(),
        };
        await tx
          .insert(userGoals)
          .values({
            userId: u,
            kcal: prev?.kcal ?? DEFAULT_GOALS.kcal,
            proteinG: prev?.proteinG ?? DEFAULT_GOALS.protein,
            ...set,
          })
          .onConflictDoUpdate({ target: userGoals.userId, set });
        return { op: 'goals', prev: prev ?? null };
      }
      case 'edit_habits': {
        const i = input as ToolInput<'edit_habits'>;
        const prev = await tx.select().from(habits).where(eq(habits.userId, u));
        const taken = new Set(prev.map((h) => h.id));
        const listed = i.habits.map((h, pos) => ({
          id: h.id ?? slug(h.name, taken),
          name: h.name.trim(),
          position: pos,
          archived: !!h.hidden,
        }));
        const ids = new Set(listed.map((h) => h.id));
        // Habits left out are hidden (their history stays), never deleted.
        const leftOut = prev
          .filter((h) => !ids.has(h.id))
          .map((h, k) => ({ id: h.id, name: h.name, position: listed.length + k, archived: true }));
        for (const h of [...listed, ...leftOut]) {
          const row = {
            name: h.name,
            position: h.position,
            archived: h.archived,
            updatedAt: new Date(),
          };
          await tx
            .insert(habits)
            .values({ userId: u, id: h.id, ...row })
            .onConflictDoUpdate({ target: [habits.userId, habits.id], set: row });
        }
        return { op: 'habits', prev };
      }
      case 'edit_plan': {
        const i = input as ToolInput<'edit_plan'>;
        const [prev] = await tx.select().from(trainingPlans).where(eq(trainingPlans.userId, u));
        const workouts = i.workouts.map((w) => ({
          name: w.name.trim(),
          ex: w.exercises.map((x) => ({
            n: x.name.trim(),
            sets: (x.sets ?? '').trim(),
            star: (x.key_lift ? 1 : 0) as 0 | 1,
          })),
        }));
        await tx
          .insert(trainingPlans)
          .values({ userId: u, workouts })
          .onConflictDoUpdate({
            target: trainingPlans.userId,
            set: { workouts, updatedAt: new Date() },
          });
        return { op: 'plan', prev: prev?.workouts ?? null };
      }
      case 'arrange_dashboard': {
        const prev = await this.layouts.get(u);
        await this.layouts.save(u, this.arrange(prev, input as ToolInput<'arrange_dashboard'>));
        return { op: 'layout', prev };
      }
      default:
        throw new Error(`${tool} is not a change tool`);
    }
  }

  private async applyUndo(tx: Tx, userId: string, undo: Undo): Promise<void> {
    switch (undo.op) {
      case 'delete': {
        const t = UNDO_TABLES[undo.table] as typeof meals;
        await tx.delete(t).where(and(eq(t.userId, userId), eq(t.id, undo.id)));
        return;
      }
      case 'insert': {
        const t = UNDO_TABLES[undo.table] as typeof meals;
        await tx
          .insert(t)
          .values(revive(undo.row) as never)
          .onConflictDoNothing();
        return;
      }
      case 'update': {
        const t = UNDO_TABLES[undo.table] as typeof meals;
        await tx
          .update(t)
          .set(revive(undo.values) as never)
          .where(and(eq(t.userId, userId), eq(t.id, undo.id)));
        return;
      }
      case 'habit_check': {
        const where = and(
          eq(habitChecks.userId, userId),
          eq(habitChecks.date, undo.date),
          eq(habitChecks.habitId, undo.habitId),
        );
        if (undo.prev == null) await tx.delete(habitChecks).where(where);
        else
          await tx.update(habitChecks).set({ done: undo.prev, updatedAt: new Date() }).where(where);
        return;
      }
      case 'goals': {
        if (!undo.prev) await tx.delete(userGoals).where(eq(userGoals.userId, userId));
        else {
          const row = revive(undo.prev) as typeof userGoals.$inferInsert;
          await tx
            .insert(userGoals)
            .values(row)
            .onConflictDoUpdate({ target: userGoals.userId, set: row });
        }
        return;
      }
      case 'habits': {
        await tx.delete(habits).where(eq(habits.userId, userId));
        if (undo.prev.length)
          await tx.insert(habits).values(undo.prev.map((r) => revive(r)) as never);
        return;
      }
      case 'plan': {
        if (!undo.prev) await tx.delete(trainingPlans).where(eq(trainingPlans.userId, userId));
        else
          await tx
            .insert(trainingPlans)
            .values({ userId, workouts: undo.prev as never })
            .onConflictDoUpdate({
              target: trainingPlans.userId,
              set: { workouts: undo.prev as never, updatedAt: new Date() },
            });
        return;
      }
      case 'layout':
        await this.layouts.save(userId, undo.prev);
        return;
    }
  }

  /* ---------------------------------------------------------------------------------------- */
  /* The action log                                                                            */

  private async record(
    q: Q,
    ctx: AgentContext,
    tool: string,
    input: unknown,
    summary: string,
    status: Receipt['status'],
    undo: Undo | null,
  ): Promise<Receipt> {
    const [row] = await q
      .insert(agentActions)
      .values({
        userId: ctx.userId,
        actor: ctx.actor,
        chatId: ctx.chatId ?? null,
        connectionId: ctx.connectionId ?? null,
        tool,
        summary,
        status,
        input: input as object,
        undo,
        settledAt: status === 'pending' ? null : new Date(),
      })
      .returning({ id: agentActions.id });
    return { actionId: row?.id as string, tool, summary, status };
  }

  private async action(q: Q, userId: string, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
    const [a] = await q
      .select()
      .from(agentActions)
      .where(and(eq(agentActions.userId, userId), eq(agentActions.id, id)));
    return a;
  }

  private receipt(a: typeof agentActions.$inferSelect, status = a.status): Receipt {
    return {
      actionId: a.id,
      tool: a.tool,
      summary: a.summary,
      status: status as Receipt['status'],
    };
  }

  /** The user tapped Apply on a proposed change. */
  async confirm(ctx: AgentContext, id: string): Promise<ActionOutcome> {
    return this.db.transaction(async (tx) => {
      const a = await this.action(tx, ctx.userId, id);
      if (!a) throw new ActionError('not_found');
      if (a.status !== 'pending')
        return { receipt: this.receipt(a), changed: [], chatId: a.chatId };
      let undo: Undo;
      try {
        undo = await this.applyChange(
          tx,
          { ...ctx, chatId: a.chatId ?? undefined },
          a.tool,
          a.input as Record<string, unknown>,
        );
      } catch (e) {
        if (e instanceof ToolInputError) throw new ActionError('stale', e.message);
        throw e;
      }
      await tx
        .update(agentActions)
        .set({ status: 'applied', undo, settledAt: new Date() })
        .where(eq(agentActions.id, a.id));
      return { receipt: this.receipt(a, 'applied'), changed: changedBy(a.tool), chatId: a.chatId };
    });
  }

  /** The user tapped Cancel on a proposed change. */
  async cancel(ctx: AgentContext, id: string): Promise<ActionOutcome> {
    const a = await this.action(this.db, ctx.userId, id);
    if (!a) throw new ActionError('not_found');
    if (a.status !== 'pending') return { receipt: this.receipt(a), changed: [], chatId: a.chatId };
    await this.db
      .update(agentActions)
      .set({ status: 'cancelled', settledAt: new Date() })
      .where(eq(agentActions.id, a.id));
    return { receipt: this.receipt(a, 'cancelled'), changed: [], chatId: a.chatId };
  }

  /** The user tapped Undo on something applied. */
  async undo(ctx: AgentContext, id: string): Promise<ActionOutcome> {
    return this.db.transaction(async (tx) => {
      const a = await this.action(tx, ctx.userId, id);
      if (!a) throw new ActionError('not_found');
      if (a.status !== 'applied' || !a.undo)
        return { receipt: this.receipt(a), changed: [], chatId: a.chatId };
      await this.applyUndo(tx, ctx.userId, a.undo as Undo);
      await tx
        .update(agentActions)
        .set({ status: 'undone', settledAt: new Date() })
        .where(eq(agentActions.id, a.id));
      return { receipt: this.receipt(a, 'undone'), changed: changedBy(a.tool), chatId: a.chatId };
    });
  }

  /** Current status of several actions (receipts are shown with their latest status). */
  /** Outside agents' actions: proposals waiting for the user, and the latest settled ones. */
  async activity(userId: string) {
    const fromAgents = and(
      eq(agentActions.userId, userId),
      sql`${agentActions.actor} like 'agent:%'`,
    );
    const [pending, recent] = await Promise.all([
      this.db
        .select()
        .from(agentActions)
        .where(and(fromAgents, eq(agentActions.status, 'pending')))
        .orderBy(desc(agentActions.createdAt))
        .limit(50),
      this.db
        .select()
        .from(agentActions)
        .where(and(fromAgents, sql`${agentActions.status} <> 'pending'`))
        .orderBy(desc(agentActions.createdAt))
        .limit(30),
    ]);
    const view = (a: typeof agentActions.$inferSelect) => ({
      ...this.receipt(a),
      agent: a.actor.replace(/^agent:/, ''),
      at: a.createdAt.toISOString(),
    });
    return { pending: pending.map(view), recent: recent.map(view) };
  }

  async statuses(userId: string, ids: string[]): Promise<Map<string, Receipt['status']>> {
    const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (!valid.length) return new Map();
    const rows = await this.db
      .select({ id: agentActions.id, status: agentActions.status })
      .from(agentActions)
      .where(and(eq(agentActions.userId, userId), inArray(agentActions.id, valid)));
    return new Map(rows.map((r) => [r.id, r.status as Receipt['status']]));
  }
}

export class ActionError extends Error {
  constructor(
    readonly code: 'not_found' | 'stale',
    message?: string,
  ) {
    super(message ?? code);
  }
}
