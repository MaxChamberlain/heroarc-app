import type { CardId } from '@heroarc/contracts';
import { useEffect, useRef } from 'react';

/*
 * "Open this card" requests (from Coach): the board scrolls the card into view and flashes it,
 * and cards with drawers open the right one (goals calculator, habits month/trends/editor,
 * training plan).
 */

const EVENT = 'heroarc:open-card';
interface Detail {
  card: CardId;
  view?: string;
}

export function requestOpenCard(card: CardId, view?: string): void {
  const tile = document.querySelector<HTMLElement>(`[data-tile="${card}"]`);
  if (tile) {
    tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
    tile.dataset.flash = '1';
    setTimeout(() => delete tile.dataset.flash, 1600);
  }
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { card, ...(view && { view }) } }));
}

/** Run `handler(view)` when something asks to open this card. */
export function useOpenCard(card: CardId, handler: (view?: string) => void): void {
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail;
      if (d.card === card) h.current(d.view);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [card]);
}
