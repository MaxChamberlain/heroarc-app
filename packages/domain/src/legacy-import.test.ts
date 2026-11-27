import { describe, expect, it } from 'vitest';
import { zonedInstant } from './dates.js';
import {
  type LegacyWorkbook,
  legacyDate,
  legacyNumber,
  legacyStamp,
  legacyTime,
  readLegacyWorkbook,
} from './legacy-import.js';

// Day serials as the original sheet stores them (days since 1899-12-30).
const serial = (iso: string) =>
  (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;

const sheet: LegacyWorkbook = {
  Settings: [
    ['Calorie goal (kcal)', 2150],
    ['Protein goal (g)', 140],
    ['Steps goal', 9000],
    ['Active kcal goal', 450],
    [],
    ['Edit the numbers in column B.'],
    [null, 'set'],
  ],
  'Nutrition Log': [
    [
      'Date',
      'Time',
      'Meal',
      'Items (est. grams)',
      'Calories',
      'Protein (g)',
      'Carbs (g)',
      'Fat (g)',
      'Confidence',
      'Source',
      'Notes',
      null,
      'Today',
    ],
    [
      serial('2026-03-04'),
      0.5 + 15 / 1440,
      'Lunch',
      'chicken bowl (350 g)',
      640,
      45,
      60,
      20,
      'High',
      'photo',
      '',
      null,
      'Calories',
    ],
    [serial('2026-03-04'), '7:05 PM', 'Dinner', 'pasta', '700', '25', '', '', 'Medium', '', 'out'],
    ['3/5/2026', '', 'snack', 'apple', 95, 0, 25, 0, '', '', ''],
    [null, null, null, null, null, null, null, null, null, null, null, null, 'Protein (g)'],
    [serial('2026-03-05'), '', 'Snack', 'mystery', '', '', '', '', '', '', ''],
  ],
  'Weight Log': [
    ['Date', 'Weight (lb)', '7-day avg', 'Change vs prev day'],
    [serial('2026-03-01'), 151.2, 151.2, ''],
    [serial('2026-03-02'), 150.8, 151, -0.4],
    [serial('2026-03-02'), 150.8, 150.9, 0],
    ['not a date', 150],
  ],
  'Training Log': [
    [
      'Date',
      'Workout',
      'Status',
      'Lift',
      'Direction',
      'Max (lb)',
      'Notes',
      'Logged at',
      'Event id',
      'Reps',
    ],
    [serial('2026-03-02'), 'Upper A', 'done', '', '', '', '', '2026-03-02 18:10:00', 'ev1', ''],
    [
      serial('2026-03-02'),
      'Upper A',
      'done',
      'Bench Press',
      'up',
      135,
      '',
      '2026-03-02 18:10:00',
      'ev1',
      8,
    ],
    [
      serial('2026-03-02'),
      'Upper A',
      'done',
      'Row',
      'same',
      95,
      '',
      '2026-03-02 18:10:00',
      'ev1',
      '',
    ],
    // An edit later the same day: a second event (the newest is the day's session).
    [serial('2026-03-02'), 'Upper A', 'partial', '', '', '', '', '2026-03-02 20:00:00', 'ev2', ''],
    [serial('2026-03-08'), '', 'rest', '', '', '', '', '2026-03-08 09:00:00', 'ev3', ''],
  ],
  Plan: [
    ['Workout', 'Exercise', 'Sets', 'Key lift (x)', 'Order'],
    ['Lower B', 'Squat', '3 x 5', 'x', 3],
    ['Upper A', 'Bench Press', '3 x 8', 'x', 1],
    ['Upper A', 'Row', '3 x 10', '', 2],
  ],
  Habits: [
    ['Habit', 'Id', 'Archive (x to hide)'],
    ['Walk 10k', 'walk', ''],
    ['No sugar', '', 'x'],
  ],
  'Habit Log': [
    ['Date', 'Habit id', 'Done', 'Logged at', 'Event id'],
    [serial('2026-03-03'), 'walk', 1, '2026-03-03 08:00:00', 'h1'],
    [serial('2026-03-03'), 'walk', 0, '2026-03-03 21:00:00', 'h2'],
    [serial('2026-03-04'), 'walk', 1, '2026-03-04 08:00:00', 'h3'],
    [serial('2026-03-04'), 'stretch', 1, '2026-03-04 08:00:00', 'h4'],
  ],
  'Mood Log': [
    ['Date', 'Time', 'Mood (1-5)', 'Note', 'Logged at', 'Event id'],
    [serial('2026-03-04'), '7:05 PM', 4, 'good workout', '2026-03-04 19:05:12', 'm-1'],
    [serial('2026-03-05'), '9:00 AM', 9, '', '', ''],
    [serial('2026-03-06'), '9:00 AM', '3', '', '', ''],
  ],
  Oura: [
    ['Date', 'Sleep score'],
    [serial('2026-03-04'), 80],
  ],
};

describe('cells', () => {
  it('reads dates from serials and text', () => {
    expect(legacyDate(serial('2026-03-04'))).toBe('2026-03-04');
    expect(legacyDate(serial('2026-03-04') + 0.75)).toBe('2026-03-04');
    expect(legacyDate('2026-3-4')).toBe('2026-03-04');
    expect(legacyDate('3/4/2026')).toBe('2026-03-04');
    expect(legacyDate('2/30/2026')).toBeNull();
    expect(legacyDate(42)).toBeNull();
    expect(legacyDate('')).toBeNull();
  });

  it('reads times from day fractions and text', () => {
    expect(legacyTime(0.5 + 15 / 1440)).toBe('12:15:00');
    expect(legacyTime('7:05 PM')).toBe('19:05:00');
    expect(legacyTime('12:30 am')).toBe('00:30:00');
    expect(legacyTime('19:05')).toBe('19:05:00');
    expect(legacyTime('25:00')).toBeNull();
    expect(legacyStamp('2026-03-04 19:05:12')).toEqual({ date: '2026-03-04', time: '19:05:12' });
    expect(legacyStamp(serial('2026-03-04') + 0.25)).toEqual({
      date: '2026-03-04',
      time: '06:00:00',
    });
  });

  it('reads numbers typed as text', () => {
    expect(legacyNumber('1,250')).toBe(1250);
    expect(legacyNumber('12.5')).toBe(12.5);
    expect(legacyNumber('abc')).toBeNull();
    expect(legacyNumber(null)).toBeNull();
  });
});

describe('readLegacyWorkbook', () => {
  const out = readLegacyWorkbook(sheet);
  const report = (tab: string) => out.report.find((r) => r.tab === tab);

  it('reads goals from Settings', () => {
    expect(out.goals).toEqual({
      kcal: 2150,
      protein: 140,
      steps: 9000,
      activeKcal: 450,
      goalsSet: true,
    });
  });

  it('reads meals, skipping rows without a date or calories (and ignoring the Today box)', () => {
    expect(out.meals.map((m) => [m.date, m.time, m.meal, m.kcal, m.protein, m.carbs])).toEqual([
      ['2026-03-04', '12:15', 'Lunch', 640, 45, 60],
      ['2026-03-04', '19:05', 'Dinner', 700, 25, null],
      ['2026-03-05', null, 'snack', 95, 0, 25],
    ]);
    expect(out.meals[0]).toMatchObject({ confidence: 'High', source: 'photo', notes: null });
    expect(report('Nutrition Log')).toMatchObject({
      rows: 4,
      entries: 3,
      skipped: 1,
      from: '2026-03-04',
      to: '2026-03-05',
    });
    expect(report('Nutrition Log')?.problems).toEqual(['Row 6: no calories']);
  });

  it('keeps identical weigh-ins as two entries', () => {
    expect(out.weights.map((w) => [w.date, w.lb])).toEqual([
      ['2026-03-01', 151.2],
      ['2026-03-02', 150.8],
      ['2026-03-02', 150.8],
    ]);
    expect(new Set(out.weights.map((w) => w.key)).size).toBe(3);
    expect(report('Weight Log')?.problems).toEqual(['Row 5: no date']);
  });

  it('groups Training Log rows into logged events, lifts included', () => {
    expect(out.sessions).toEqual([
      {
        key: 'legacy:training:ev1',
        date: '2026-03-02',
        workout: 'Upper A',
        status: 'done',
        lifts: {
          'Bench Press': { dir: 'up', wt: 135, reps: 8 },
          Row: { dir: 'same', wt: 95, reps: null },
        },
        loggedAt: { date: '2026-03-02', time: '18:10:00' },
      },
      expect.objectContaining({ key: 'legacy:training:ev2', status: 'partial', lifts: {} }),
      expect.objectContaining({ key: 'legacy:training:ev3', workout: null, status: 'rest' }),
    ]);
    expect(report('Training Log')).toMatchObject({ rows: 5, entries: 3 });
  });

  it('rebuilds the plan in order, with key lifts', () => {
    expect(out.plan).toEqual([
      {
        name: 'Upper A',
        ex: [
          { n: 'Bench Press', sets: '3 x 8', star: 1 },
          { n: 'Row', sets: '3 x 10', star: 0 },
        ],
      },
      { name: 'Lower B', ex: [{ n: 'Squat', sets: '3 x 5', star: 1 }] },
    ]);
  });

  it('reads habits (latest tap wins), keeping ticks of habits no longer listed', () => {
    expect(out.habits).toEqual([
      { id: 'walk', name: 'Walk 10k', archived: false, position: 0 },
      { id: 'no-sugar', name: 'No sugar', archived: true, position: 1 },
      { id: 'stretch', name: 'stretch', archived: true, position: 2 },
    ]);
    expect(out.habitChecks).toEqual([
      { date: '2026-03-03', habitId: 'walk', done: false },
      { date: '2026-03-04', habitId: 'walk', done: true },
      { date: '2026-03-04', habitId: 'stretch', done: true },
    ]);
  });

  it('reads moods, skipping ones outside 1 to 5', () => {
    expect(out.moods).toEqual([
      {
        key: 'legacy:mood:m-1',
        date: '2026-03-04',
        mood: 4,
        note: 'good workout',
        loggedAt: { date: '2026-03-04', time: '19:05:12' },
      },
      expect.objectContaining({
        date: '2026-03-06',
        mood: 3,
        loggedAt: { date: '2026-03-06', time: '09:00:00' },
      }),
    ]);
    expect(report('Mood Log')?.problems).toEqual(['Row 3: mood is not 1 to 5']);
  });

  it('gives the same keys every time (re-importing adds nothing twice)', () => {
    const again = readLegacyWorkbook(sheet);
    expect(again.meals.map((m) => m.key)).toEqual(out.meals.map((m) => m.key));
    expect(again.weights.map((w) => w.key)).toEqual(out.weights.map((w) => w.key));
    expect(again.moods.map((m) => m.key)).toEqual(out.moods.map((m) => m.key));
    expect(out.meals.every((m) => m.key.startsWith('legacy:meal:'))).toBe(true);
  });

  it("doesn't read the Oura tab, and says which tabs it found", () => {
    expect(out.found).not.toContain('Oura' as never);
    expect(out.found).toContain('Weight Log');
    expect(readLegacyWorkbook({ Sheet1: [['a']] }).found).toEqual([]);
  });

  it('matches tab names loosely', () => {
    expect(
      readLegacyWorkbook({ ' weight log ': sheet['Weight Log'] as never }).weights,
    ).toHaveLength(3);
  });
});

describe('zonedInstant', () => {
  it('turns a local day and clock into the instant, across DST', () => {
    expect(zonedInstant('2026-01-15', '07:30:00', 'America/Denver').toISOString()).toBe(
      '2026-01-15T14:30:00.000Z',
    );
    expect(zonedInstant('2026-07-15', '07:30', 'America/Denver').toISOString()).toBe(
      '2026-07-15T13:30:00.000Z',
    );
    expect(zonedInstant('2026-03-04', '19:05:12', 'Europe/London').toISOString()).toBe(
      '2026-03-04T19:05:12.000Z',
    );
    // 2:30 AM didn't happen in Denver on 2026-03-08: it lands just after the change.
    expect(zonedInstant('2026-03-08', '02:30', 'America/Denver').toISOString()).toBe(
      '2026-03-08T09:30:00.000Z',
    );
  });
});
