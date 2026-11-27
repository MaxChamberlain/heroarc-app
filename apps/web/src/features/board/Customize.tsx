import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CardId, Tile } from '@heroarc/contracts';
import { readingOrder, repack } from '@heroarc/domain';
import type { ReactNode } from 'react';
import s from './Customize.module.css';
import { BOARD_CARDS } from './cards';
import { GripIcon } from './icons';
import { cx } from './lib';
import u from './ui.module.css';

interface CustomizeProps {
  tiles: Tile[];
  onChange: (tiles: Tile[]) => void;
  onReset: () => void;
  /** Board (desktop) or list-only (phone, tablet): only changes the help text. */
  board: boolean;
}

/**
 * Every card in board order: drag the handle (or use the keyboard) to reorder, flip the
 * switch to hide or show. Reordering re-packs the board so its reading order matches.
 */
export function CustomizeList({ tiles, onChange, board }: Omit<CustomizeProps, 'onReset'>) {
  const shown = readingOrder(tiles);
  const hidden = tiles.filter((t) => t.hidden);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const order = shown.map((t) => t.id);
  const onDragEnd = (e: DragEndEvent) => {
    const from = order.indexOf(e.active.id as CardId);
    const to = e.over ? order.indexOf(e.over.id as CardId) : -1;
    if (from < 0 || to < 0 || from === to) return;
    onChange(repack(arrayMove(order, from, to), tiles));
  };

  const setHidden = (id: CardId, hide: boolean) => {
    if (hide) {
      onChange(tiles.map((t) => (t.id === id ? { ...t, hidden: true } : t)));
      return;
    }
    // A card that comes back goes to the bottom of the board, keeping its size.
    const bottom = shown.reduce((m, t) => Math.max(m, t.y + t.h), 0);
    onChange(tiles.map((t) => (t.id === id ? { ...t, hidden: false, x: 0, y: bottom } : t)));
  };

  return (
    <div className={s.list}>
      <p className={u.note} style={{ margin: '4px 6px 0' }}>
        {board
          ? 'Drag cards on the board to move them and pull a corner to resize. Or reorder them here.'
          : 'Drag the handles to reorder. Your desktop board follows the same order.'}
      </p>
      <div className={s.group}>On your board</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {shown.map((t) => (
            <SortableRow key={t.id} id={t.id}>
              <Switch id={t.id} on onToggle={() => setHidden(t.id, true)} />
            </SortableRow>
          ))}
        </SortableContext>
      </DndContext>
      {hidden.length > 0 && (
        <>
          <div className={s.group}>Hidden</div>
          {hidden.map((t) => (
            <div key={t.id} className={cx(s.row, s.off)} data-row={t.id}>
              <span className={s.grip} aria-hidden="true" />
              <Name id={t.id} />
              <Switch id={t.id} on={false} onToggle={() => setHidden(t.id, false)} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SortableRow({ id, children }: { id: CardId; children: ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const card = BOARD_CARDS[id];
  return (
    <div
      ref={setNodeRef}
      className={cx(s.row, isDragging && s.dragging)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-row={id}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={s.grip}
        aria-label={`Move ${card.title}`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <Name id={id} />
      {children}
    </div>
  );
}

function Name({ id }: { id: CardId }) {
  const card = BOARD_CARDS[id];
  return (
    <span className={s.name}>
      <b>{card.title}</b>
      <small>{card.group}</small>
    </span>
  );
}

function Switch({ id, on, onToggle }: { id: CardId; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Show ${BOARD_CARDS[id].title}`}
      className={s.switch}
      data-switch={id}
      onClick={onToggle}
    />
  );
}

/** Desktop: a panel beside the board while customizing. */
export function CustomizePanel({
  tiles,
  onChange,
  onReset,
  onCancel,
  onDone,
}: Omit<CustomizeProps, 'board'> & { onCancel: () => void; onDone: () => void }) {
  return (
    <aside className={s.panel} aria-label="Customize board">
      <div className={s.head}>
        <h2>Customize</h2>
      </div>
      <CustomizeList tiles={tiles} onChange={onChange} board />
      <CustomizeFooter onReset={onReset} onCancel={onCancel} onDone={onDone} />
    </aside>
  );
}

export function CustomizeFooter({
  onReset,
  onCancel,
  onDone,
}: {
  onReset: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <div className={s.foot}>
      <button type="button" className={u.link} onClick={onReset} data-reset="1">
        Reset
      </button>
      <span className={s.spacer} />
      <button type="button" className={u.btn} onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className={u.primary} onClick={onDone} data-done="1">
        Done
      </button>
    </div>
  );
}
