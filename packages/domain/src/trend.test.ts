import { describe, expect, it } from 'vitest';
import { slopePerDay, trendPerWeek } from './trend.js';

describe('trendPerWeek', () => {
  it('needs at least 3 points', () => {
    expect(
      trendPerWeek([
        { day: 0, value: 135 },
        { day: 1, value: 136 },
      ]),
    ).toBeNull();
  });

  it('returns the least-squares slope scaled to a week', () => {
    // A perfect +0.2 lb/day line → +1.4 lb/week.
    const points = [0, 1, 2, 3, 4].map((day) => ({ day, value: 135 + 0.2 * day }));
    expect(trendPerWeek(points)).toBeCloseTo(1.4, 10);
  });

  it('handles gaps between weigh-ins', () => {
    const points = [
      { day: 0, value: 134 },
      { day: 5, value: 135 },
      { day: 10, value: 136 },
    ];
    expect(slopePerDay(points)).toBeCloseTo(0.2, 10);
  });

  it('returns null when every point is on the same day', () => {
    const points = [1, 2, 3].map((value) => ({ day: 4, value }));
    expect(slopePerDay(points)).toBeNull();
  });
});
