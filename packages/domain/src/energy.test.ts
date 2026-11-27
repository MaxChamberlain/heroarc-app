import { describe, expect, it } from 'vitest';
import { energyBalance, predictedWeightChangeLb } from './energy.js';

describe('energyBalance', () => {
  it('matches the live HeroArc Trends card for 2026-11-25', () => {
    // Live app: 890 in − 2,352 out = −1,462; resting 1,906, active 446.
    const result = energyBalance({ kcalIn: 890, totalKcal: 2352, activeKcal: 446 });
    expect(result).toEqual({
      kcalIn: 890,
      restingBurn: 1906,
      activeBurn: 446,
      totalOut: 2352,
      balance: -1462,
    });
  });

  it('never reports negative resting burn', () => {
    expect(energyBalance({ kcalIn: 0, totalKcal: 100, activeKcal: 300 }).restingBurn).toBe(0);
  });
});

describe('predictedWeightChangeLb', () => {
  it('uses 3,500 kcal per lb', () => {
    // Live app weekly card: −3,121 kcal over 7 logged days → −0.9 lb predicted.
    expect(predictedWeightChangeLb(-3121)).toBeCloseTo(-0.89, 2);
  });
});
