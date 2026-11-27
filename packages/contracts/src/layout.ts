import { oc } from '@orpc/contract';
import { z } from 'zod';

/*
 * The dashboard board layout (one per account). The board is a 12-column grid, modelled
 * on PostHog dashboards: each card is a tile with a position (x, y) and size (w, h) in grid
 * units. Phones don't store their own layout: they stack the visible tiles in reading
 * order (by y, then x). Card sizes and the default layout live in @heroarc/domain (layout.ts).
 */

/** Every card the board knows. Add new cards here first (and in domain CARD_SPECS). */
export const CARD_IDS = [
  'meter',
  'health',
  'goals',
  'weight',
  'nutrition',
  'thought',
  'training',
  'habits',
  'mood',
  'energy',
  'weightTrend',
  'sleepTrend',
  'moodTrend',
] as const;
export const CardId = z.enum(CARD_IDS);

/** Card names people see (customize panel, Coach's receipts). */
export const CARD_TITLES: Record<(typeof CARD_IDS)[number], string> = {
  meter: 'Meters',
  health: 'Health',
  goals: 'Goals',
  weight: 'Weight and activity',
  nutrition: 'Nutrition',
  thought: 'Thought for today',
  training: 'Training',
  habits: 'Habits',
  mood: 'Mood check-in',
  energy: 'Energy balance',
  weightTrend: 'Weight, 14 days',
  sleepTrend: 'Sleep and readiness, 14 days',
  moodTrend: 'Mood, 14 days',
};
export type CardId = z.infer<typeof CardId>;

export const GRID_COLS = 12;

export const Tile = z
  .object({
    id: CardId,
    x: z
      .number()
      .int()
      .min(0)
      .max(GRID_COLS - 1),
    y: z.number().int().min(0).max(10_000),
    w: z.number().int().min(1).max(GRID_COLS),
    h: z.number().int().min(1).max(60),
    hidden: z.boolean(),
  })
  .refine((t) => t.x + t.w <= GRID_COLS, 'tile extends past the right edge');
export type Tile = z.infer<typeof Tile>;

export const Layout = z
  .object({
    version: z.literal(1),
    cols: z.literal(GRID_COLS),
    tiles: z.array(Tile).max(CARD_IDS.length),
  })
  .refine((l) => new Set(l.tiles.map((t) => t.id)).size === l.tiles.length, 'duplicate card');
export type Layout = z.infer<typeof Layout>;

export const layoutContract = {
  get: oc
    .route({
      method: 'GET',
      path: '/api/v1/layout',
      summary: "The signed-in user's dashboard layout (the default layout until they save one).",
      tags: ['layout'],
    })
    .output(Layout),
  save: oc
    .route({
      method: 'PUT',
      path: '/api/v1/layout',
      summary: 'Save the dashboard layout. Unknown cards are dropped; sizes are clamped.',
      tags: ['layout'],
    })
    .input(Layout)
    .output(Layout),
};
