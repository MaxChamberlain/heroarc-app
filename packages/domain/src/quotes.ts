import { QUOTES } from './quotes-data.js';

/** A "Thought for today" quote. `icon` picks the card's line icon (col, blade, enso, dawn). */
export interface Quote {
  text: string;
  author: string;
  source: string;
  translator: string;
  icon: string;
}

export { QUOTES };

/** Days since 1970-01-01 for a 'YYYY-MM-DD' date (0 if malformed). */
function dayNumber(day: string): number {
  const p = String(day || '')
    .split('-')
    .map(Number);
  if (p.length !== 3 || p.some(Number.isNaN)) return 0;
  return Math.floor(Date.UTC(p[0] as number, (p[1] as number) - 1, p[2] as number) / 86400000);
}

/** The quote for a day: everyone sees the same one, and it changes at midnight. */
export function quoteFor(day: string, quotes: readonly Quote[] = QUOTES): Quote | undefined {
  const n = quotes.length;
  if (!n) return undefined;
  return quotes[((dayNumber(day) % n) + n) % n];
}
