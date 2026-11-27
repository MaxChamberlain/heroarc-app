/**
 * Energy balance math, ported from the original HeroArc Trends card.
 *
 * Oura reports `totalKcal` (resting + active burn for the day) and `activeKcal`.
 * Resting burn is derived as total − active. Balance = kcal in − total out:
 * negative is a deficit, positive a surplus.
 */
export interface EnergyInputs {
  /** Calories eaten (sum of logged food for the day). */
  kcalIn: number;
  /** Oura's full-day burn estimate (resting + active). */
  totalKcal: number;
  /** Oura's active burn so far. */
  activeKcal: number;
}

export interface EnergyBalance {
  kcalIn: number;
  restingBurn: number;
  activeBurn: number;
  totalOut: number;
  /** kcalIn − totalOut. Negative = deficit. */
  balance: number;
}

export function energyBalance({ kcalIn, totalKcal, activeKcal }: EnergyInputs): EnergyBalance {
  const restingBurn = Math.max(0, totalKcal - activeKcal);
  const totalOut = restingBurn + activeKcal;
  return {
    kcalIn,
    restingBurn,
    activeBurn: activeKcal,
    totalOut,
    balance: kcalIn - totalOut,
  };
}

/** Pounds of body weight per kcal of net balance (classic 3,500 kcal ≈ 1 lb rule). */
export const KCAL_PER_LB = 3500;

/** Predicted weight change in lb for a net kcal balance (negative = loss). */
export function predictedWeightChangeLb(netKcal: number): number {
  return netKcal / KCAL_PER_LB;
}
