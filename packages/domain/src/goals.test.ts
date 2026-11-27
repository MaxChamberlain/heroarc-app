import { describe, expect, it } from 'vitest';
import { calculateGoals, macroSplit } from './goals.js';

describe('calculateGoals (Mifflin-St Jeor, ported from the original app)', () => {
  it('maintain: BMR × activity, rounded to 10 kcal; protein 0.75 g/lb', () => {
    // kg 61.24, cm 165.1 → BMR 1333; ×1.375 = 1833 → 1830.
    expect(
      calculateGoals({
        sex: 'female',
        age: 30,
        height: 65,
        weight: 135,
        activity: 'light',
        goal: 'maintain',
      }),
    ).toEqual({ bmr: 1333, kcal: 1830, protein: 101, fat: 60, carbs: 220 });
  });

  it('lose: minus 20% capped at 500, never below the floor; protein 0.9 g/lb', () => {
    const r = calculateGoals({
      sex: 'male',
      age: 40,
      height: 70,
      weight: 200,
      activity: 'moderate',
      goal: 'lose',
    });
    // BMR = 907.2 + 1111.25 − 200 + 5 = 1823; ×1.55 = 2826; −500 (cap) = 2326 → 2330.
    expect(r).toEqual({ bmr: 1823, kcal: 2330, protein: 180, fat: 80, carbs: 225 });
  });

  it('gain: +300 kcal; protein 0.85 g/lb', () => {
    const r = calculateGoals({
      sex: 'female',
      age: 25,
      height: 64,
      weight: 120,
      activity: 'sedentary',
      goal: 'gain',
    });
    expect(r.kcal).toBe(Math.round((r.bmr * 1.2 + 300) / 10) * 10);
    expect(r.protein).toBe(102);
  });

  it('applies the 1,200 / 1,500 kcal floors', () => {
    const r = calculateGoals({
      sex: 'female',
      age: 90,
      height: 48,
      weight: 70,
      activity: 'sedentary',
      goal: 'lose',
    });
    expect(r.kcal).toBe(1200);
  });
});

describe('macroSplit', () => {
  it('gives fat 30% of calories and carbs the rest after protein, in 5 g steps', () => {
    // fat 2200·0.3/9 = 73.3 → 75 g; carbs (2200 − 600 − 675)/4 = 231 → 230 g.
    expect(macroSplit(2200, 150)).toEqual({ fat: 75, carbs: 230 });
  });

  it('never goes below zero carbs when protein is very high', () => {
    expect(macroSplit(1200, 300).carbs).toBe(0);
  });
});
