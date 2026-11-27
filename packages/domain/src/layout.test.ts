import { CARD_IDS, type CardId, Layout, type Tile } from '@heroarc/contracts';
import { describe, expect, it } from 'vitest';
import { CARD_SPECS, DEFAULT_LAYOUT, normalizeLayout, readingOrder, repack } from './layout.js';

const overlaps = (a: Tile, b: Tile) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('DEFAULT_LAYOUT', () => {
  it('is a valid layout with every card exactly once and no overlaps', () => {
    expect(Layout.safeParse(DEFAULT_LAYOUT).success).toBe(true);
    expect(DEFAULT_LAYOUT.tiles.map((t) => t.id).sort()).toEqual([...CARD_IDS].sort());
    const tiles = DEFAULT_LAYOUT.tiles;
    for (let i = 0; i < tiles.length; i++)
      for (let j = i + 1; j < tiles.length; j++)
        expect(
          overlaps(tiles[i] as Tile, tiles[j] as Tile),
          `${tiles[i]?.id}/${tiles[j]?.id}`,
        ).toBe(false);
  });

  it('respects every card size rule', () => {
    for (const t of DEFAULT_LAYOUT.tiles) {
      const s = CARD_SPECS[t.id];
      expect(t.w).toBeGreaterThanOrEqual(s.minW);
      expect(t.h).toBeGreaterThanOrEqual(s.minH);
    }
  });
});

describe('normalizeLayout', () => {
  it('uses the default when nothing (or an empty layout) is saved', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout({ version: 1, cols: 12, tiles: [] })).toEqual(DEFAULT_LAYOUT);
  });

  it('clamps sizes and keeps tiles inside the grid', () => {
    const out = normalizeLayout({
      version: 1,
      cols: 12,
      tiles: [{ id: 'health', x: 11, y: 0, w: 1, h: 1, hidden: false }],
    });
    const health = out.tiles.find((t) => t.id === 'health');
    expect(health).toMatchObject({ w: CARD_SPECS.health.minW, h: CARD_SPECS.health.minH });
    expect((health?.x ?? 0) + (health?.w ?? 0)).toBeLessThanOrEqual(12);
  });

  it('drops duplicates and appends cards the saved layout predates', () => {
    const out = normalizeLayout({
      version: 1,
      cols: 12,
      tiles: [
        { id: 'mood', x: 0, y: 0, w: 4, h: 6, hidden: true },
        { id: 'mood', x: 4, y: 0, w: 4, h: 6, hidden: false },
      ],
    });
    expect(out.tiles.filter((t) => t.id === 'mood')).toHaveLength(1);
    expect(out.tiles.find((t) => t.id === 'mood')?.hidden).toBe(true);
    expect(out.tiles).toHaveLength(CARD_IDS.length);
    // Appended cards start below everything already there.
    expect(out.tiles.filter((t) => t.id !== 'mood').every((t) => t.y >= 6)).toBe(true);
  });
});

describe('readingOrder', () => {
  it('goes top-to-bottom, then left-to-right, and skips hidden cards', () => {
    const tiles: Tile[] = [
      { id: 'goals', x: 4, y: 2, w: 4, h: 4, hidden: false },
      { id: 'health', x: 0, y: 2, w: 4, h: 8, hidden: false },
      { id: 'meter', x: 0, y: 0, w: 12, h: 2, hidden: false },
      { id: 'mood', x: 8, y: 2, w: 4, h: 6, hidden: true },
    ];
    expect(readingOrder(tiles).map((t) => t.id)).toEqual(['meter', 'health', 'goals']);
  });

  it('gives a sensible phone order for the default board', () => {
    expect(
      readingOrder(DEFAULT_LAYOUT.tiles)
        .map((t) => t.id)
        .slice(0, 4),
    ).toEqual(['meter', 'health', 'goals', 'weight']);
  });
});

describe('repack', () => {
  it('lays tiles out so the reading order is exactly the requested order', () => {
    const order: CardId[] = ['mood', 'weightTrend', 'health', 'meter', 'habits', 'goals'];
    const out = repack(order, DEFAULT_LAYOUT.tiles);
    expect(
      readingOrder(out)
        .filter((t) => order.includes(t.id))
        .map((t) => t.id),
    ).toEqual(order);
  });

  it('keeps sizes, never overlaps, and stays inside the grid', () => {
    const order = [...CARD_IDS].reverse();
    const out = repack(order, DEFAULT_LAYOUT.tiles);
    for (const t of out) {
      const before = DEFAULT_LAYOUT.tiles.find((d) => d.id === t.id);
      expect([t.w, t.h]).toEqual([before?.w, before?.h]);
      expect(t.x + t.w).toBeLessThanOrEqual(12);
    }
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++)
        expect(overlaps(out[i] as Tile, out[j] as Tile)).toBe(false);
  });

  it('puts tiles missing from the order (e.g. hidden ones) below', () => {
    const out = repack(['goals', 'health'], DEFAULT_LAYOUT.tiles);
    const bottom = Math.max(
      ...out.filter((t) => ['goals', 'health'].includes(t.id)).map((t) => t.y + t.h),
    );
    expect(out.filter((t) => !['goals', 'health'].includes(t.id)).every((t) => t.y >= bottom)).toBe(
      true,
    );
  });
});
