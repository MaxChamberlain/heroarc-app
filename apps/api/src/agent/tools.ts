import { CARD_IDS, THEME_IDS } from '@heroarc/contracts';
import { z } from 'zod';

/*
 * The agent tool registry: every action an agent (Coach today; MCP and REST agents in Phase 4)
 * can take, with its input schema and how it's gated.
 *
 * - read:   looks at data; no side effects.
 * - log:    adds something new; applies at once and returns a receipt with Undo.
 * - change: edits or deletes existing things, or rearranges the dashboard; creates a
 *           pending action the user must Apply (then it can be undone).
 * - app:    acts in the app itself (show a day, switch theme, open a card); nothing is stored.
 *
 * Outside agents (MCP, REST, the Hermes API) get externalTools(): no app actions, no Coach notes.
 *
 * Implementations live in AgentService (agent.service.ts). To add a tool: define it here,
 * implement it there, and test it (agent.service.test.ts).
 */

export type ToolKind = 'read' | 'log' | 'change' | 'app';

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A day as YYYY-MM-DD, in the user's timezone");
const Id = z.string().min(1).max(64);
const RecordKind = z.enum(['meal', 'weight', 'mood', 'training']);
const Lifts = z
  .record(
    z.string(),
    z.object({
      wt: z.number().min(0).max(1500),
      reps: z.number().int().min(1).max(200).optional(),
    }),
  )
  .describe('Key-lift maxes by lift name: { "Bench Press": { "wt": 135, "reps": 8 } }');

export interface ToolDef {
  name: string;
  kind: ToolKind;
  description: string;
  input: z.ZodObject;
  /** What the app shows while it runs ("Looking at last week…"). */
  status: string;
  /** Coach only: not offered to outside agents (MCP, REST). */
  coachOnly?: true;
}

const tool = <S extends z.ZodObject>(d: Omit<ToolDef, 'input'> & { input: S }) => d;

export const TOOLS = {
  get_day: tool({
    name: 'get_day',
    kind: 'read',
    status: 'Looking at that day…',
    description:
      'Everything the user logged on one day: meals (with ids), weigh-ins, mood check-ins, habits ticked, the training session. (Wearable data from Oura is not available to assistants.) Use it before editing or deleting a record, to find its id.',
    input: z.object({ date: Day }),
  }),
  get_range: tool({
    name: 'get_range',
    kind: 'read',
    status: 'Looking through your history…',
    description:
      'A per-day summary for a date range (up to 400 days, all of history is available): kcal/protein/carbs/fat eaten, weight, average mood, habits done, training status. (Wearable data from Oura is not available to assistants.) Use it for trends and comparisons.',
    input: z.object({ from: Day, to: Day }),
  }),
  get_setup: tool({
    name: 'get_setup',
    kind: 'read',
    status: 'Checking your setup…',
    description:
      'The current goals, the habit list (ids, names, hidden ones), the training plan, and the dashboard layout (cards in reading order, their sizes and which are hidden).',
    input: z.object({}),
  }),

  log_meal: tool({
    name: 'log_meal',
    kind: 'log',
    status: 'Logging the meal…',
    description:
      "Log something eaten. Estimate calories and macros from the description or photo; say how sure you are with confidence. If the user sent a photo of it, pass that photo's id as photo_id. Defaults to today.",
    input: z.object({
      date: Day.optional(),
      time: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional()
        .describe('Local time HH:MM, if known'),
      meal: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']),
      items: z.string().min(1).max(300).describe('What was eaten, with rough amounts'),
      kcal: z.number().min(0).max(5000),
      protein_g: z.number().min(0).max(400),
      carbs_g: z.number().min(0).max(800).optional(),
      fat_g: z.number().min(0).max(400).optional(),
      confidence: z.enum(['Low', 'Medium', 'High']).optional(),
      photo_id: Id.optional(),
      notes: z.string().max(300).optional(),
    }),
  }),
  log_weight: tool({
    name: 'log_weight',
    kind: 'log',
    status: 'Logging the weigh-in…',
    description:
      "Log a weigh-in in pounds. Defaults to today. The day's latest weigh-in is its weight.",
    input: z.object({ date: Day.optional(), lb: z.number().min(70).max(500) }),
  }),
  log_mood: tool({
    name: 'log_mood',
    kind: 'log',
    status: 'Logging your mood…',
    description:
      'Log how the user feels right now, 1 (low) to 5 (great), with an optional short note. Only when they tell you how they feel.',
    input: z.object({ mood: z.number().int().min(1).max(5), note: z.string().max(200).optional() }),
  }),
  set_habit: tool({
    name: 'set_habit',
    kind: 'log',
    status: 'Updating your habits…',
    description:
      'Tick (done: true) or untick a habit for a day. Get habit ids from get_setup. Defaults to today.',
    input: z.object({ habit_id: Id, date: Day.optional(), done: z.boolean() }),
  }),
  log_training: tool({
    name: 'log_training',
    kind: 'log',
    status: 'Logging the workout…',
    description:
      "Log a day's training: a workout from the plan (by name) done or partly done with optional key-lift maxes, or a rest day (status rest, no workout). Defaults to today.",
    input: z.object({
      date: Day.optional(),
      workout: z.string().max(30).optional(),
      status: z.enum(['done', 'partial', 'rest']),
      lifts: Lifts.optional(),
    }),
  }),
  remember: tool({
    name: 'remember',
    kind: 'log',
    // Coach's own memory, read in every chat: outside agents don't write to it.
    coachOnly: true,
    status: 'Making a note…',
    description:
      "Keep a short, lasting fact about the user that will help in future chats (diet, injuries, schedule, preferences). Only things they told you; nothing they'd consider private unless they ask.",
    input: z.object({ text: z.string().min(2).max(200) }),
  }),
  forget: tool({
    name: 'forget',
    kind: 'log',
    coachOnly: true,
    status: 'Forgetting that…',
    description: 'Remove one of your notes about the user (note ids are listed in the context).',
    input: z.object({ note_id: Id }),
  }),

  edit_record: tool({
    name: 'edit_record',
    kind: 'change',
    status: 'Preparing the change…',
    description:
      'Change a past record (meal, weigh-in, mood check-in or training session). Find its id with get_day first. Only the fields you pass change. The user confirms before it applies.',
    input: z.object({
      kind: RecordKind,
      id: Id,
      changes: z.object({
        date: Day.optional(),
        time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        meal: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']).optional(),
        items: z.string().min(1).max(300).optional(),
        kcal: z.number().min(0).max(5000).optional(),
        protein_g: z.number().min(0).max(400).optional(),
        carbs_g: z.number().min(0).max(800).optional(),
        fat_g: z.number().min(0).max(400).optional(),
        notes: z.string().max(300).optional(),
        lb: z.number().min(70).max(500).optional(),
        mood: z.number().int().min(1).max(5).optional(),
        note: z.string().max(200).optional(),
        workout: z.string().max(30).nullable().optional(),
        status: z.enum(['done', 'partial', 'rest']).optional(),
        lifts: Lifts.optional(),
      }),
    }),
  }),
  delete_record: tool({
    name: 'delete_record',
    kind: 'change',
    status: 'Preparing the change…',
    description:
      'Delete a past record (meal, weigh-in, mood check-in or training session) by id (find it with get_day). The user confirms first.',
    input: z.object({ kind: RecordKind, id: Id }),
  }),
  set_goals: tool({
    name: 'set_goals',
    kind: 'change',
    status: 'Preparing new goals…',
    description:
      'Change daily goals. Only the fields you pass change. track_macros shows fat and carbs on the dashboard. The user confirms first.',
    input: z.object({
      kcal: z.number().min(1000).max(6000).optional(),
      protein_g: z.number().min(40).max(400).optional(),
      carbs_g: z.number().min(20).max(800).optional(),
      fat_g: z.number().min(10).max(300).optional(),
      track_macros: z.boolean().optional(),
      steps: z.number().int().min(1000).max(50000).optional(),
      active_kcal: z.number().int().min(50).max(3000).optional(),
    }),
  }),
  edit_habits: tool({
    name: 'edit_habits',
    kind: 'change',
    status: 'Preparing the habit list…',
    description:
      'Replace the habit list (in order). Keep existing habits by passing their id; new ones have no id. hidden: true hides a habit but keeps its history. At most 8 visible. The user confirms first.',
    input: z.object({
      habits: z
        .array(
          z.object({
            id: Id.optional(),
            name: z.string().min(1).max(30),
            hidden: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(20),
    }),
  }),
  edit_plan: tool({
    name: 'edit_plan',
    kind: 'change',
    status: 'Preparing the training plan…',
    description:
      'Replace the training plan: workouts in order, each with exercises (sets like "3 x 10"); key_lift marks lifts whose max is tracked (at most 8 per workout). History is kept. The user confirms first.',
    input: z.object({
      workouts: z
        .array(
          z.object({
            name: z.string().min(1).max(30),
            exercises: z
              .array(
                z.object({
                  name: z.string().min(1).max(40),
                  sets: z.string().max(20).optional(),
                  key_lift: z.boolean().optional(),
                }),
              )
              .min(1)
              .max(14),
          }),
        )
        .min(1)
        .max(7),
    }),
  }),
  arrange_dashboard: tool({
    name: 'arrange_dashboard',
    kind: 'change',
    status: 'Rearranging the dashboard…',
    description: `Rearrange the dashboard (a 12-column grid). Cards: ${CARD_IDS.join(', ')} (meter = the readiness/sleep/protein/steps strip, thought = quote of the day, energy = energy balance, *Trend = 14-day charts). Pass order (visible cards, first to last; sizes kept) and/or tiles (per card: x 0–11, y, w 1–12 columns, h rows, hidden). reset restores the default. The user confirms first.`,
    input: z.object({
      reset: z.boolean().optional(),
      order: z.array(z.enum(CARD_IDS)).optional(),
      tiles: z
        .array(
          z.object({
            card: z.enum(CARD_IDS),
            x: z.number().int().min(0).max(11).optional(),
            y: z.number().int().min(0).max(200).optional(),
            w: z.number().int().min(1).max(12).optional(),
            h: z.number().int().min(1).max(24).optional(),
            hidden: z.boolean().optional(),
          }),
        )
        .optional(),
    }),
  }),

  show_day: tool({
    name: 'show_day',
    kind: 'app',
    status: 'Opening that day…',
    description: 'Show a day on the dashboard (the board switches to that date).',
    input: z.object({ date: Day }),
  }),
  set_theme: tool({
    name: 'set_theme',
    kind: 'app',
    status: 'Switching theme…',
    description: `Switch the app's theme on this device: ${THEME_IDS.join(', ')} (simple is the plain one; the rest are gamified with a hero figure).`,
    input: z.object({ theme: z.enum(THEME_IDS) }),
  }),
  open_card: tool({
    name: 'open_card',
    kind: 'app',
    status: 'Opening that…',
    description:
      "Bring a card into view and open its drawer: goals (view 'edit' = goals calculator), habits (view 'month', 'trends' or 'edit'), training (view 'plan' = plan editor); any other card just scrolls into view.",
    input: z.object({
      card: z.enum(CARD_IDS),
      view: z.enum(['edit', 'month', 'trends', 'plan']).optional(),
    }),
  }),
} satisfies Record<string, ToolDef>;

export type ToolName = keyof typeof TOOLS;
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOLS)[N]['input']>;

export const isToolName = (n: string): n is ToolName => n in TOOLS;

/** Tools outside agents (MCP, REST) may call: not app actions, not Coach's own notes. */
export function externalTools(): ToolDef[] {
  return Object.values(TOOLS).filter((t: ToolDef) => t.kind !== 'app' && !t.coachOnly);
}
export const isExternalTool = (n: string): n is ToolName =>
  isToolName(n) && externalTools().some((t) => t.name === n);

/** A tool's input as JSON Schema (draft 2020-12). */
export const inputSchema = (t: ToolDef) =>
  (({ $schema: _, ...rest }) => rest)(z.toJSONSchema(t.input)) as {
    type: 'object';
    [k: string]: unknown;
  };

/** Tool definitions for the model, in a stable order (keeps the prompt cache warm). */
export function toolSchemas() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: inputSchema(t),
  }));
}
