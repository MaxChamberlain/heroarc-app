import type { CardId, Tile } from '@heroarc/contracts';
import { CARD_SPECS, readingOrder } from '@heroarc/domain';
import { type ReactNode, useMemo } from 'react';
import ReactGridLayout, { type Layout as RglLayout, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { AutoHeightContext, tileClass } from './Card';
import s from './Grid.module.css';
import { EyeOffIcon, GripIcon } from './icons';
import { cx } from './lib';
import type { Breakpoint } from './useBreakpoint';

/** Grid row height and gap (px). A tile of h rows is h·ROW + (h−1)·GAP tall. */
export const ROW = 30;
export const GAP = 16;

interface GridProps {
  bp: Breakpoint;
  tiles: Tile[];
  editing: boolean;
  /** New positions and sizes after a drag or resize (customizing on desktop only). */
  onChange: (tiles: Tile[]) => void;
  onHide: (id: CardId) => void;
  title: (id: CardId) => string;
  render: (id: CardId) => ReactNode;
}

/**
 * The board. Desktop: a 12-column react-grid-layout board (drag and resize while customizing).
 * Tablet: two columns. Phone: one column. Stacked layouts follow the board's reading order.
 */
export function Grid({ bp, tiles, editing, onChange, onHide, title, render }: GridProps) {
  const visible = useMemo(() => readingOrder(tiles), [tiles]);
  if (!visible.length)
    return <div className={s.empty}>Every card is hidden. Tap Customize to bring some back.</div>;
  if (bp === 'board')
    return (
      <BoardGrid
        tiles={tiles}
        visible={visible}
        editing={editing}
        onChange={onChange}
        onHide={onHide}
        title={title}
        render={render}
      />
    );
  const item = (t: Tile) => (
    <div key={t.id} className={cx(tileClass, s.item)} data-tile={t.id}>
      {render(t.id)}
    </div>
  );
  if (bp === 'one')
    return (
      <AutoHeightContext.Provider value={true}>
        <div className={cx(s.board, s.stack)}>{visible.map(item)}</div>
      </AutoHeightContext.Provider>
    );
  return (
    <AutoHeightContext.Provider value={true}>
      <div className={cx(s.board, s.stack)}>
        {bands(visible).map((b) =>
          'wide' in b ? (
            item(b.wide)
          ) : (
            <div className={s.cols} key={b.left[0]?.id ?? b.right[0]?.id}>
              <div className={s.col}>{b.left.map(item)}</div>
              <div className={s.col}>{b.right.map(item)}</div>
            </div>
          ),
        )}
      </div>
    </AutoHeightContext.Provider>
  );
}

type Band = { wide: Tile } | { left: Tile[]; right: Tile[] };

/**
 * Two-column layout: full-width tiles (9+ columns on the board) span both columns;
 * the rest go, in reading order, to whichever column is shorter so far.
 */
function bands(visible: Tile[]): Band[] {
  const out: Band[] = [];
  let cur: { left: Tile[]; right: Tile[]; lh: number; rh: number } | null = null;
  for (const t of visible) {
    if (t.w >= 9) {
      if (cur) out.push(cur);
      cur = null;
      out.push({ wide: t });
      continue;
    }
    cur ??= { left: [], right: [], lh: 0, rh: 0 };
    if (cur.lh <= cur.rh) {
      cur.left.push(t);
      cur.lh += t.h;
    } else {
      cur.right.push(t);
      cur.rh += t.h;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function BoardGrid({
  tiles,
  visible,
  editing,
  onChange,
  onHide,
  title,
  render,
}: Omit<GridProps, 'bp'> & { visible: Tile[] }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const layout: RglLayout = useMemo(
    () =>
      visible.map((t) => {
        const sp = CARD_SPECS[t.id];
        return {
          i: t.id,
          x: t.x,
          y: t.y,
          w: t.w,
          h: t.h,
          minW: sp.minW,
          minH: sp.minH,
          maxW: sp.maxW,
          maxH: sp.maxH,
        };
      }),
    [visible],
  );

  const changed = (l: RglLayout) => {
    if (!editing) return;
    const by = new Map(l.map((x) => [x.i, x]));
    let diff = false;
    const next = tiles.map((t) => {
      const x = by.get(t.id);
      if (!x || (x.x === t.x && x.y === t.y && x.w === t.w && x.h === t.h)) return t;
      diff = true;
      return { ...t, x: x.x, y: x.y, w: x.w, h: x.h };
    });
    if (diff) onChange(next);
  };

  return (
    <div ref={containerRef} className={s.board}>
      {mounted && (
        <ReactGridLayout
          layout={layout}
          width={width}
          gridConfig={{ cols: 12, rowHeight: ROW, margin: [GAP, GAP], containerPadding: [0, 0] }}
          dragConfig={{ enabled: editing, handle: `.${s.handle}`, bounded: false, threshold: 3 }}
          resizeConfig={{ enabled: editing, handles: ['se'] }}
          onLayoutChange={changed}
        >
          {visible.map((t) => (
            <div
              key={t.id}
              className={cx(tileClass, s.item, editing && s.editing)}
              data-tile={t.id}
            >
              {render(t.id)}
              {editing && (
                <div className={s.chrome}>
                  <div className={s.handle} title="Drag to move">
                    <GripIcon size={16} />
                    <span>{title(t.id)}</span>
                  </div>
                  <button
                    type="button"
                    className={s.hide}
                    aria-label={`Hide ${title(t.id)}`}
                    data-hide={t.id}
                    onClick={() => onHide(t.id)}
                  >
                    <EyeOffIcon size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
}
