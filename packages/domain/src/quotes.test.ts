import { describe, expect, it } from 'vitest';
import { QUOTES, quoteFor } from './quotes.js';

describe('quoteFor', () => {
  it('matches the original app on 2026-11-25 (Marcus Aurelius, Meditations IV)', () => {
    const q = quoteFor('2026-11-25');
    expect(q?.author).toBe('Marcus Aurelius');
    expect(q?.source).toBe('Meditations, Book IV');
  });

  it('cycles through every quote, one per day', () => {
    expect(QUOTES.length).toBeGreaterThan(50);
    expect(quoteFor('2026-11-26')).not.toEqual(quoteFor('2026-11-25'));
  });
});
