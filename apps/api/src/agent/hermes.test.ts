import { describe, expect, it } from 'vitest';
import { foodInput, HermesInputError, trainingInput, weightInput } from './hermes.js';
import { TOOLS } from './tools.js';

// Payloads as Hermes / n8n sent them to the original API (scripts/server.py).
describe('POST /food', () => {
  it('maps the original fields to log_meal, accepting numbers as text', () => {
    const { input, dryRun } = foodInput({
      meal: 'lunch',
      items: 'chicken bowl\nwith rice',
      kcal: '640',
      p: 45,
      c: '60.5',
      f: 20,
      conf: 'high',
      source: 'photo',
      notes: 'from the cafe',
      date: '2026-11-20',
      time: '12:30',
    });
    expect(dryRun).toBe(false);
    expect(input).toEqual({
      meal: 'Lunch',
      items: 'chicken bowl with rice',
      kcal: 640,
      protein_g: 45,
      carbs_g: 60.5,
      fat_g: 20,
      confidence: 'High',
      notes: 'from the cafe',
      date: '2026-11-20',
      time: '12:30',
    });
    expect(TOOLS.log_meal.input.safeParse(input).success).toBe(true);
  });

  it('dry_run only when exactly true', () => {
    const base = { meal: 'Snack', items: 'apple', kcal: 95, p: 0, c: 25, f: 0 };
    expect(foodInput({ ...base, dry_run: true }).dryRun).toBe(true);
    expect(foodInput({ ...base, dry_run: 'yes' }).dryRun).toBe(false);
  });

  it('says which field is wrong', () => {
    const base = { meal: 'Dinner', items: 'pasta', kcal: 700, p: 25, c: 90, f: 20 };
    expect(() => foodInput({ ...base, meal: 'brunch' })).toThrow(
      'meal must be Breakfast, Lunch, Dinner or Snack',
    );
    expect(() => foodInput({ ...base, kcal: 'lots' })).toThrow('kcal must be a number');
    expect(() => foodInput({ ...base, kcal: 9000 })).toThrow('kcal=9000 is outside 0..5000');
    expect(() => foodInput({ ...base, p: undefined })).toThrow('p is required');
    expect(() => foodInput({ ...base, date: '20/11/2026' })).toThrow(
      'date must look like YYYY-MM-DD',
    );
    expect(() => foodInput({ ...base, time: '7pm' })).toThrow(HermesInputError);
  });
});

describe('POST /weight', () => {
  it('takes lb (text or number) and an optional date', () => {
    expect(weightInput({ lb: '150.4' })).toEqual({ lb: 150.4 });
    expect(weightInput({ lb: 149, date: '2026-11-01' })).toEqual({ lb: 149, date: '2026-11-01' });
    expect(() => weightInput({})).toThrow('lb is required');
    expect(() => weightInput({ lb: true })).toThrow('lb must be a number');
  });
});

describe('POST /training', () => {
  it('one workout with one lift; status defaults to done', () => {
    expect(trainingInput({ workout: 'Upper A', lift: 'Bench Press', lb: '135', reps: 8 })).toEqual({
      workout: 'Upper A',
      status: 'done',
      lifts: { 'Bench Press': { wt: 135, reps: 8 } },
    });
  });

  it("adds to the day's current session for the same workout", () => {
    const current = {
      workout: 'Upper A',
      status: 'done',
      lifts: { 'Bench Press': { wt: 135, reps: 8 } },
    };
    expect(trainingInput({ workout: 'upper a', lift: 'Row', lb: 95, reps: 10 }, current)).toEqual({
      workout: 'Upper A',
      status: 'done',
      lifts: { 'Bench Press': { wt: 135, reps: 8 }, Row: { wt: 95, reps: 10 } },
    });
    // A different workout starts fresh.
    expect(trainingInput({ workout: 'Lower B' }, current)).toEqual({
      workout: 'Lower B',
      status: 'done',
    });
  });

  it('rest days have no workout; lift, lb and reps go together', () => {
    expect(trainingInput({ workout: 'Rest', status: 'REST' })).toEqual({ status: 'rest' });
    expect(() => trainingInput({ workout: 'Upper A', lift: 'Bench' })).toThrow(
      'give lift, lb and reps together, or none of them',
    );
    expect(() => trainingInput({ workout: 'Upper A', status: 'skipped' })).toThrow(
      'status must be done, partial or rest',
    );
  });
});
