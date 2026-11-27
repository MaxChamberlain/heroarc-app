import { useSyncExternalStore } from 'react';

/**
 * Which layout the board uses:
 * - `board` (≥ 1024 px): the 12-column widget board (drag, resize);
 * - `two` (640–1023 px): two columns in reading order;
 * - `one` (< 640 px): one column in reading order.
 */
export type Breakpoint = 'board' | 'two' | 'one';

const BOARD = '(min-width: 1024px)';
const TWO = '(min-width: 640px)';

function read(): Breakpoint {
  if (typeof window === 'undefined') return 'board';
  if (window.matchMedia(BOARD).matches) return 'board';
  return window.matchMedia(TWO).matches ? 'two' : 'one';
}

function subscribe(cb: () => void) {
  const a = window.matchMedia(BOARD);
  const b = window.matchMedia(TWO);
  a.addEventListener('change', cb);
  b.addEventListener('change', cb);
  return () => {
    a.removeEventListener('change', cb);
    b.removeEventListener('change', cb);
  };
}

export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, read, () => 'board');
}
