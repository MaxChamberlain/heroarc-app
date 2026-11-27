import { shiftDate } from './dates.js';

/**
 * Hero / character progress over the rolling 7 days ending on `day`, ported from the
 * original heroMetrics(). Pillars are the same in every theme; themes only rename the slots.
 *
 *   helm  = Rest:  nights with sleep score ≥ 75            (target 4)
 *   armor = Fuel:  days with protein ≥ 80% of the goal       (target 4)
 *   legs  = Move:  days with steps ≥ 80% of the goal         (target 4)
 *   blade = Train: workouts logged as done or partial        (target 3)
 *   aura  = Balance: 1 when all four are full, else their average × 0.85
 */
export const HERO_SLOTS = ['helm', 'armor', 'legs', 'blade'] as const;
export type HeroSlot = (typeof HERO_SLOTS)[number];

export const HERO_TARGETS: Record<HeroSlot, number> = { helm: 4, armor: 4, legs: 4, blade: 3 };
export const REST_SLEEP_SCORE = 75;
export const GOAL_SHARE = 0.8;

export interface HeroDay {
  sleep?: number | null;
  protein?: number | null;
  steps?: number | null;
}

export interface HeroInputs {
  day: string;
  days: Record<string, HeroDay | undefined>;
  goals: { protein?: number; steps?: number };
  /** Training sessions: date + status. */
  sessions: ReadonlyArray<{ d: string; s: string | null }>;
}

export interface HeroProgress {
  /** Fill per slot, 0..1. */
  fill: Record<HeroSlot | 'aura', number>;
  /** Qualifying counts in the window. */
  counts: Record<HeroSlot, number>;
  thresholds: { protein: number; steps: number };
}

export function heroProgress({ day, days, goals, sessions }: HeroInputs): HeroProgress {
  const steps = Math.round((goals.steps || 10000) * GOAL_SHARE);
  const protein = Math.round((goals.protein || 110) * GOAL_SHARE);
  let sl = 0;
  let pr = 0;
  let sp = 0;
  for (let i = 0; i < 7; i++) {
    const x = days[shiftDate(day, -i)];
    if (!x) continue;
    if (x.sleep != null && x.sleep >= REST_SLEEP_SCORE) sl++;
    if (x.protein != null && x.protein >= protein) pr++;
    if (x.steps != null && x.steps >= steps) sp++;
  }
  const from = shiftDate(day, -6);
  const wk = sessions.filter(
    (e) => e.d >= from && e.d <= day && (e.s === 'done' || e.s === 'partial'),
  ).length;
  const counts = { helm: sl, armor: pr, legs: sp, blade: wk };
  const slotFill = {
    helm: Math.min(1, sl / HERO_TARGETS.helm),
    armor: Math.min(1, pr / HERO_TARGETS.armor),
    legs: Math.min(1, sp / HERO_TARGETS.legs),
    blade: Math.min(1, wk / HERO_TARGETS.blade),
  };
  const allFull = HERO_SLOTS.every((k) => slotFill[k] >= 1);
  const aura = allFull ? 1 : (HERO_SLOTS.reduce((a, k) => a + slotFill[k], 0) / 4) * 0.85;
  return { fill: { ...slotFill, aura }, counts, thresholds: { protein, steps } };
}
