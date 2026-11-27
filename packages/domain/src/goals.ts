/** Goal calculator (Mifflin-St Jeor), ported verbatim from the original app. An estimate, not medical advice. */

export type Sex = 'female' | 'male';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very active';
export type GoalType = 'lose' | 'maintain' | 'gain';

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  'very active': 1.9,
};

export interface GoalInputs {
  sex: Sex;
  age: number;
  /** Inches. */
  height: number;
  /** Pounds. */
  weight: number;
  activity: ActivityLevel;
  goal: GoalType;
}

export interface GoalEstimate {
  /** Resting burn, kcal/day. */
  bmr: number;
  /** Suggested calorie goal, rounded to 10. */
  kcal: number;
  /** Suggested protein goal, grams. */
  protein: number;
  /** Suggested fat goal, grams (30 % of calories). */
  fat: number;
  /** Suggested carbs goal, grams (the calories left after protein and fat). */
  carbs: number;
}

const round5 = (g: number) => Math.max(0, Math.round(g / 5) * 5);

/**
 * Fat and carbs for a calorie and protein goal: fat is 30 % of calories (9 kcal/g),
 * carbs take what's left after protein (4 kcal/g) and fat (4 kcal/g). Rounded to 5 g.
 */
export function macroSplit(kcal: number, protein: number): { fat: number; carbs: number } {
  const fat = round5((kcal * 0.3) / 9);
  return { fat, carbs: round5((kcal - protein * 4 - fat * 9) / 4) };
}

export function calculateGoals(s: GoalInputs): GoalEstimate {
  const kg = s.weight / 2.2046;
  const cm = s.height * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * s.age + (s.sex === 'male' ? 5 : -161);
  let k = bmr * ACTIVITY_FACTOR[s.activity];
  k += s.goal === 'lose' ? -Math.min(500, k * 0.2) : s.goal === 'gain' ? 300 : 0;
  k = Math.max(k, s.sex === 'male' ? 1500 : 1200);
  const proteinPerLb = s.goal === 'lose' ? 0.9 : s.goal === 'gain' ? 0.85 : 0.75;
  const kcal = Math.round(k / 10) * 10;
  const protein = Math.round(s.weight * proteinPerLb);
  return { bmr: Math.round(bmr), kcal, protein, ...macroSplit(kcal, protein) };
}
