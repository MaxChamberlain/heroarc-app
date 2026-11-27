import { describe, expect, it } from 'vitest';
import { buildSnapshot, type MetricsRow, type SnapshotInput } from './snapshot.js';

// 2026-11-26T02:30Z is 7:30 PM on 2026-11-25 in Denver (MST).
const NOW = new Date('2026-11-26T02:30:00Z');
const TZ = 'America/Denver';

function metrics(date: string, over: Partial<MetricsRow> = {}): MetricsRow {
  return {
    date,
    sleepScore: 73,
    readiness: 80,
    sleepHours: 6.5,
    hrv: 117,
    rhr: 52,
    bedMin: 1433,
    wakeMin: 429,
    stressMin: 60,
    recoveryMin: 120,
    stressSummary: 'normal',
    steps: 5751,
    activeKcal: 446,
    totalKcal: 2352,
    updatedAt: new Date('2026-11-26T02:15:00Z'),
    ...over,
  };
}

function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    now: NOW,
    timeZone: TZ,
    goals: null,
    metrics: [],
    weights: [],
    meals: [],
    habits: [],
    habitChecks: [],
    moods: [],
    plan: null,
    sessions: [],
    ...over,
  };
}

describe('buildSnapshot', () => {
  it('uses the user timezone for "today" and the updated stamp', () => {
    const s = buildSnapshot(input({ metrics: [metrics('2026-11-25')] }));
    expect(s.date).toBe('2026-11-25');
    expect(s.updated).toBe('7:15 PM MST');
  });

  it('starts empty with the original default goals', () => {
    const s = buildSnapshot(input());
    expect(s.days).toEqual({});
    expect(s.goals).toEqual({
      steps: 10000,
      activeKcal: 500,
      kcal: 2200,
      protein: 150,
      carbs: 230,
      fat: 75,
      trackMacros: false,
      goalsSet: false,
    });
    expect(s.goalsForm).toBeNull();
    expect(s.habits).toEqual({ list: [], archived: [], log: {}, pending: [] });
    expect(s.training?.program.workouts).toEqual([]);
    expect(s.trend).toHaveLength(14);
    expect(s.today.kcalIn).toBe(0);
  });

  it('sums meals per day and keeps the newest weight for a day', () => {
    const s = buildSnapshot(
      input({
        meals: [
          { date: '2026-11-25', kcal: 500.4, proteinG: 40 },
          { date: '2026-11-25', kcal: 389.7, proteinG: 53 },
        ],
        weights: [
          { date: '2026-11-25', weightLb: 137.0, createdAt: new Date('2026-11-25T14:00:00Z') },
          { date: '2026-11-25', weightLb: 136.6, createdAt: new Date('2026-11-25T15:00:00Z') },
          { date: '2026-11-20', weightLb: 135.2, createdAt: new Date('2026-11-20T15:00:00Z') },
        ],
      }),
    );
    expect(s.days['2026-11-25']).toMatchObject({ kcalIn: 890, protein: 93, weight: 136.6 });
    expect(s.today).toMatchObject({ kcalIn: 890, protein: 93, weight: 136.6 });
    expect(s.trend.at(-1)).toEqual({
      d: '2026-11-25',
      sleep: null,
      readiness: null,
      weight: 136.6,
    });
    // Days with any data are listed newest first, like the original.
    expect(Object.keys(s.days)).toEqual(['2026-11-25', '2026-11-20']);
  });

  it('falls back to the last scored night when today has no sleep yet', () => {
    const s = buildSnapshot(
      input({
        metrics: [
          metrics('2026-11-24', { sleepScore: 81, readiness: 77 }),
          metrics('2026-11-25', { sleepScore: null, readiness: null, steps: 1200 }),
        ],
      }),
    );
    expect(s.ouraDay).toBe('2026-11-24');
    expect(s.today).toMatchObject({ sleep: 81, readiness: 77, steps: 1200 });
  });

  it('only keeps 90 days of history', () => {
    const s = buildSnapshot(input({ metrics: [metrics('2026-08-27'), metrics('2026-08-28')] }));
    expect(Object.keys(s.days)).toEqual(['2026-08-28']);
  });

  it('shapes training: plan key lifts and the newest session per day', () => {
    const s = buildSnapshot(
      input({
        plan: [
          {
            name: 'Upper',
            ex: [
              { n: 'Bench', sets: '3 x 5', star: 1 },
              { n: 'Row', sets: '3 x 10', star: 0 },
            ],
          },
        ],
        sessions: [
          {
            date: '2026-11-24',
            workout: 'Upper',
            status: 'partial',
            lifts: {},
            loggedAt: new Date('2026-11-24T18:00:00Z'),
          },
          {
            date: '2026-11-24',
            workout: 'Upper',
            status: 'done',
            lifts: { Bench: { wt: 95, reps: 5 } },
            loggedAt: new Date('2026-11-24T19:00:00Z'),
          },
        ],
      }),
    );
    expect(s.training?.program.workouts[0]).toEqual({
      name: 'Upper',
      exercises: [
        { n: 'Bench', sets: '3 x 5', type: '' },
        { n: 'Row', sets: '3 x 10', type: '' },
      ],
      keyLifts: ['Bench'],
    });
    expect(s.training?.log).toEqual([
      {
        d: '2026-11-24',
        w: 'Upper',
        s: 'done',
        lifts: { Bench: { dir: null, wt: 95, reps: 5 } },
        t: '2026-11-24T19:00:00.000Z',
      },
    ]);
  });

  it('shapes habits (order, archived, done-only log) and mood (local times, oldest first)', () => {
    const s = buildSnapshot(
      input({
        habits: [
          { id: 'read', name: 'Read', position: 1, archived: false },
          { id: 'stretch', name: 'Stretch', position: 0, archived: false },
          { id: 'old', name: 'Old one', position: 2, archived: true },
        ],
        habitChecks: [
          { date: '2026-11-25', habitId: 'stretch', done: true },
          { date: '2026-11-25', habitId: 'read', done: false },
        ],
        moods: [
          {
            date: '2026-11-25',
            mood: 4,
            note: 'later',
            loggedAt: new Date('2026-11-25T23:05:00Z'),
          },
          { date: '2026-11-25', mood: 2, note: '', loggedAt: new Date('2026-11-25T15:00:00Z') },
        ],
      }),
    );
    expect(s.habits).toEqual({
      list: [
        { id: 'stretch', n: 'Stretch' },
        { id: 'read', n: 'Read' },
      ],
      archived: [{ id: 'old', n: 'Old one' }],
      log: { '2026-11-25': ['stretch'] },
      pending: [],
    });
    expect(s.mood?.log['2026-11-25']).toEqual([
      { t: '8:00 AM', m: 2, n: '' },
      { t: '4:05 PM', m: 4, n: 'later' },
    ]);
  });

  it('sums fat and carbs per day, null when no meal recorded them', () => {
    const s = buildSnapshot(
      input({
        meals: [
          { date: '2026-11-25', kcal: 500, proteinG: 40, carbsG: 50.4, fatG: 12 },
          { date: '2026-11-25', kcal: 300, proteinG: 20, carbsG: null, fatG: 9.7 },
          { date: '2026-11-24', kcal: 400, proteinG: 30 },
        ],
      }),
    );
    expect(s.days['2026-11-25']).toMatchObject({ carbs: 50, fat: 22 });
    expect(s.days['2026-11-24']).toMatchObject({ carbs: null, fat: null });
  });

  it('uses saved fat and carbs goals and the macros switch', () => {
    const s = buildSnapshot(
      input({
        goals: {
          kcal: 2000,
          proteinG: 120,
          carbsG: 210,
          fatG: 70,
          trackMacros: true,
          steps: 10000,
          activeKcal: 500,
          goalsSet: true,
          sex: 'male',
          age: 40,
          heightIn: 70,
          weightLb: 180,
          activity: 'light',
          goal: 'maintain',
        },
      }),
    );
    expect(s.goals).toMatchObject({ carbs: 210, fat: 70, trackMacros: true });
    expect(s.goalsForm).toMatchObject({ carbs: 210, fat: 70, trackMacros: true });
  });

  it('exposes saved goals and the calculator inputs', () => {
    const s = buildSnapshot(
      input({
        goals: {
          kcal: 3060,
          proteinG: 160,
          steps: 10000,
          activeKcal: 500,
          goalsSet: true,
          sex: 'female',
          age: 30,
          heightIn: 65,
          weightLb: 135,
          activity: 'light',
          goal: 'maintain',
        },
      }),
    );
    expect(s.goals).toEqual({
      steps: 10000,
      activeKcal: 500,
      kcal: 3060,
      protein: 160,
      carbs: 380,
      fat: 100,
      trackMacros: false,
      goalsSet: true,
    });
    expect(s.goalsForm).toMatchObject({ sex: 'female', height: 65, weight: 135, kcal: 3060 });
  });
});
