import { describe, expect, it } from 'vitest';
import { ouraClockMinutes, ouraDays } from './oura.js';

describe('ouraDays', () => {
  it("joins the day's summaries into one dashboard row", () => {
    const rows = ouraDays({
      daily_sleep: [{ day: '2026-11-26', score: 83 }],
      daily_readiness: [{ day: '2026-11-26', score: 91.6 }],
      daily_activity: [
        { day: '2026-11-26', steps: 8421, active_calories: 412, total_calories: 2290 },
      ],
      sleep: [
        {
          day: '2026-11-26',
          type: 'long_sleep',
          total_sleep_duration: 26_100,
          average_hrv: 62,
          lowest_heart_rate: 51,
          bedtime_start: '2026-11-25T23:41:30-07:00',
          bedtime_end: '2026-11-26T07:12:00-07:00',
        },
        // A nap the same day doesn't count.
        { day: '2026-11-26', type: 'late_nap', total_sleep_duration: 1800, average_hrv: 40 },
      ],
      daily_stress: [
        { day: '2026-11-26', stress_high: 5400, recovery_high: 3660, day_summary: 'normal' },
      ],
    });
    expect(rows).toEqual([
      {
        date: '2026-11-26',
        sleepScore: 83,
        readiness: 92,
        sleepHours: 7.25,
        hrv: 62,
        rhr: 51,
        bedMin: 23 * 60 + 41,
        wakeMin: 7 * 60 + 12,
        stressMin: 90,
        recoveryMin: 61,
        stressSummary: 'normal',
        steps: 8421,
        activeKcal: 412,
        totalKcal: 2290,
      },
    ]);
  });

  it('keeps days with partial data, oldest first, and takes the longest main sleep', () => {
    const rows = ouraDays({
      daily_activity: [{ day: '2026-11-27', steps: 1200 }],
      sleep: [
        { day: '2026-11-25', type: 'long_sleep', total_sleep_duration: 10_000, average_hrv: 50 },
        { day: '2026-11-25', type: 'long_sleep', total_sleep_duration: 20_000, average_hrv: 55 },
      ],
      daily_stress: [{ day: 'bad', stress_high: 1 }],
    });
    expect(rows.map((r) => r.date)).toEqual(['2026-11-25', '2026-11-27']);
    expect(rows[0]).toMatchObject({ hrv: 55, sleepHours: 5.56, sleepScore: null });
    expect(rows[1]).toMatchObject({ steps: 1200, readiness: null, bedMin: null });
  });

  it('reads the local clock from Oura timestamps', () => {
    expect(ouraClockMinutes('2026-11-26T00:30:00+01:00')).toBe(30);
    expect(ouraClockMinutes(null)).toBeNull();
    expect(ouraClockMinutes('nonsense')).toBeNull();
  });
});
