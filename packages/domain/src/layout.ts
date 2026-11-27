import { CARD_IDS, type CardId, GRID_COLS, type Layout, type Tile } from '@heroarc/contracts';

/*
 * Board layout rules (pure). The board is a 12-column grid; a tile's h is in rows
 * (see the web board for the row height). Phones derive their order from the board.
 */

export interface CardSpec {
  /** Default size. */
  w: number;
  h: number;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
}

const spec = (w: number, h: number, minW: number, minH: number, maxW = GRID_COLS, maxH = 24) => ({
  w,
  h,
  minW,
  minH,
  maxW,
  maxH,
});

/** Size rules per card (grid units). */
export const CARD_SPECS: Record<CardId, CardSpec> = {
  meter: spec(12, 3, 6, 3, 12, 4),
  health: spec(4, 9, 3, 8),
  goals: spec(4, 5, 3, 4),
  weight: spec(4, 7, 3, 6),
  nutrition: spec(4, 6, 3, 5),
  thought: spec(4, 6, 3, 4),
  training: spec(4, 8, 3, 6),
  habits: spec(4, 8, 3, 6),
  mood: spec(4, 8, 3, 6),
  energy: spec(4, 9, 3, 7),
  weightTrend: spec(6, 7, 3, 5),
  sleepTrend: spec(6, 7, 3, 5),
  moodTrend: spec(4, 5, 3, 4),
};

const t = (id: CardId, x: number, y: number, w = CARD_SPECS[id].w, h = CARD_SPECS[id].h): Tile => ({
  id,
  x,
  y,
  w,
  h,
  hidden: false,
});

/**
 * The board new users start with: the meter strip, then three columns (body: health,
 * training, habits; food: goals, nutrition, energy; log: weight, mood, thought, mood trend),
 * then the two 14-day charts side by side.
 */
export const DEFAULT_LAYOUT: Layout = {
  version: 1,
  cols: GRID_COLS,
  tiles: [
    t('meter', 0, 0),
    t('health', 0, 3),
    t('goals', 4, 3),
    t('weight', 8, 3),
    t('nutrition', 4, 8),
    t('mood', 8, 10),
    t('training', 0, 12),
    t('energy', 4, 14),
    t('thought', 8, 18),
    t('habits', 0, 20),
    t('moodTrend', 8, 24),
    t('weightTrend', 0, 29),
    t('sleepTrend', 6, 29),
  ],
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Clamp a tile to its card's size rules and the grid. */
function clampTile(tile: Tile): Tile {
  const s = CARD_SPECS[tile.id];
  const w = clamp(tile.w, s.minW, Math.min(s.maxW, GRID_COLS));
  const h = clamp(tile.h, s.minH, s.maxH);
  const x = clamp(tile.x, 0, GRID_COLS - w);
  return { ...tile, x, y: Math.max(0, tile.y), w, h };
}

/**
 * Make any saved layout safe to render: drop unknown and duplicate cards, clamp sizes,
 * and append cards added since it was saved (at the bottom, in default order).
 * A missing or empty layout becomes the default (so saving `tiles: []` resets the board).
 */
export function normalizeLayout(saved: Layout | null | undefined): Layout {
  if (!saved?.tiles.length) return structuredClone(DEFAULT_LAYOUT);
  const known = new Set<string>(CARD_IDS);
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  for (const tile of saved.tiles) {
    if (!known.has(tile.id) || seen.has(tile.id)) continue;
    seen.add(tile.id);
    tiles.push(clampTile(tile));
  }
  let bottom = tiles.reduce((m, x) => Math.max(m, x.y + x.h), 0);
  for (const d of DEFAULT_LAYOUT.tiles) {
    if (seen.has(d.id)) continue;
    tiles.push({ ...d, x: 0, y: bottom });
    bottom += d.h;
  }
  return { version: 1, cols: GRID_COLS, tiles };
}

/** Visible tiles top-to-bottom, left-to-right: the order phones show them in. */
export function readingOrder(tiles: readonly Tile[]): Tile[] {
  return tiles.filter((x) => !x.hidden).sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Lay tiles out row by row in the given order (keeping their sizes), so that
 * readingOrder() of the result is exactly `order`. Used when cards are reordered from
 * the list panel (e.g. on a phone). Tiles not in `order` (hidden ones) go below.
 */
export function repack(order: readonly CardId[], tiles: readonly Tile[]): Tile[] {
  const byId = new Map(tiles.map((x) => [x.id, x]));
  const out: Tile[] = [];
  let x = 0;
  let rowY = 0;
  let rowBottom = 0;
  for (const id of order) {
    const tile = byId.get(id);
    if (!tile) continue;
    if (x + tile.w > GRID_COLS) {
      x = 0;
      rowY = rowBottom;
    }
    out.push({ ...tile, x, y: rowY });
    rowBottom = Math.max(rowBottom, rowY + tile.h);
    x += tile.w;
  }
  const placed = new Set(order);
  let y = rowBottom;
  for (const tile of tiles) {
    if (placed.has(tile.id)) continue;
    out.push({ ...tile, x: 0, y });
    y += tile.h;
  }
  return out;
}
