import { describe, expect, it } from 'vitest';
import { shiftDate } from './dates.js';
import { heroProgress } from './hero.js';

const DAY = '2026-11-25';
const back = (i: number) => shiftDate(DAY, -i);

describe('heroProgress', () => {
  it('reproduces the live app on 2026-11-25: 1/4, 4/4, 4/4, 0/3 and aura 48%', () => {
    const days = {
      [back(0)]: { sleep: 73, protein: 93, steps: 5751 },
      [back(1)]: { sleep: 76, protein: 140, steps: 9000 },
      [back(2)]: { sleep: 70, protein: 150, steps: 12000 },
      [back(3)]: { sleep: 68, protein: 130, steps: 8000 },
      [back(4)]: { sleep: 72, protein: 128, steps: 8500 },
      [back(5)]: { sleep: 74, protein: 90, steps: 3000 },
    };
    const p = heroProgress({ day: DAY, days, goals: { protein: 160, steps: 10000 }, sessions: [] });
    expect(p.thresholds).toEqual({ protein: 128, steps: 8000 });
    expect(p.counts).toEqual({ helm: 1, armor: 4, legs: 4, blade: 0 });
    expect(p.fill.helm).toBe(0.25);
    expect(Math.round(p.fill.aura * 100)).toBe(48);
  });

  it('lights the aura fully when all four slots are full', () => {
    const days = Object.fromEntries(
      [0, 1, 2, 3].map((i) => [back(i), { sleep: 80, protein: 200, steps: 12000 }]),
    );
    const sessions = [0, 2, 4].map((i) => ({ d: back(i), s: 'done' }));
    expect(heroProgress({ day: DAY, days, goals: {}, sessions }).fill.aura).toBe(1);
  });

  it('counts only done/partial workouts inside the 7-day window', () => {
    const sessions = [
      { d: back(0), s: 'partial' },
      { d: back(1), s: 'rest' },
      { d: back(6), s: 'done' },
      { d: back(7), s: 'done' },
    ];
    expect(heroProgress({ day: DAY, days: {}, goals: {}, sessions }).counts.blade).toBe(2);
  });
});
