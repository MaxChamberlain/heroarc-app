import { describe, expect, it } from 'vitest';
import writeXlsxFile, { type SheetData } from 'write-excel-file/node';
import { ImportError, LegacyImportService } from './legacy-import.service.js';

// Workbooks written the way Google Sheets exports them: date and time cells, numbers, text.
async function xlsx(sheets: Array<[string, SheetData]>): Promise<Blob> {
  const buf = await writeXlsxFile(sheets.map(([sheet, data]) => ({ sheet, data }))).toBuffer();
  return new Blob([new Uint8Array(buf)]);
}
const day = (y: number, m: number, d: number) => ({
  value: new Date(Date.UTC(y, m - 1, d)),
  type: Date,
  format: 'yyyy-mm-dd',
});
const clock = (h: number, min: number) => ({
  value: new Date(Date.UTC(1899, 11, 30, h, min)),
  type: Date,
  format: 'h:mm AM/PM',
});

const service = new LegacyImportService({} as never);

describe('reading the old sheet (.xlsx)', () => {
  it('reads date and time cells as the original app wrote them', async () => {
    const file = await xlsx([
      [
        'Settings',
        [
          ['Calorie goal (kcal)', 2150],
          ['Protein goal (g)', 140],
        ],
      ],
      [
        'Weight Log',
        [
          ['Date', 'Weight (lb)', '7-day avg', 'Change vs prev day'],
          [day(2026, 3, 4), 150.4, 150.4, null],
        ],
      ],
      [
        'Nutrition Log',
        [
          ['Date', 'Time', 'Meal', 'Items', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'],
          [day(2026, 3, 4), clock(12, 15), 'Lunch', 'chicken bowl', 640, 45, 60, 20],
        ],
      ],
      [
        'Mood Log',
        [
          ['Date', 'Time', 'Mood (1-5)', 'Note', 'Logged at', 'Event id'],
          [day(2026, 3, 4), clock(19, 5), 4, 'good', '2026-03-04 19:05:12', 'm1'],
        ],
      ],
      [
        'Oura',
        [
          ['Date', 'Sleep score'],
          [day(2026, 3, 4), 80],
        ],
      ],
    ]);
    const data = await service.read(file);
    expect(data.found).toEqual(['Settings', 'Nutrition Log', 'Weight Log', 'Mood Log']);
    expect(data.goals).toMatchObject({ kcal: 2150, protein: 140 });
    expect(data.weights).toEqual([
      { key: expect.stringMatching(/^legacy:weight:/), date: '2026-03-04', lb: 150.4 },
    ]);
    expect(data.meals[0]).toMatchObject({
      date: '2026-03-04',
      time: '12:15',
      meal: 'Lunch',
      kcal: 640,
    });
    expect(data.moods[0]).toMatchObject({
      key: 'legacy:mood:m1',
      loggedAt: { date: '2026-03-04', time: '19:05:12' },
    });
  });

  it('refuses files that aren’t spreadsheets, or aren’t the old sheet', async () => {
    await expect(service.read(new Blob(['name,lb\nme,150']))).rejects.toThrow(ImportError);
    await expect(service.read(new Blob(['name,lb\nme,150']))).rejects.toThrow(/Microsoft Excel/);
    const other = await xlsx([
      [
        'Budget',
        [
          ['Month', 'Spent'],
          ['March', 120],
        ],
      ],
    ]);
    await expect(service.read(other)).rejects.toThrow(/doesn't look like the old HeroArc sheet/);
  });
});
