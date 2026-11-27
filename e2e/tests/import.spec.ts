import { expect, type Page, test } from '@playwright/test';
import writeXlsxFile, { type SheetData } from 'write-excel-file/node';

// Settings → Import from the old HeroArc: an .xlsx shaped like the original Google Sheet.
test.use({ serviceWorkers: 'block' });

const snapshot = async (page: Page) => (await page.request.get('/api/data')).json();
/** Days of their own (70+ back: older than the tests that log, within the board's 90 days). */
async function pastDay(page: Page, back: number) {
  const d = new Date(`${(await snapshot(page)).date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}
const cellDay = (d: Date) => ({ value: d, type: Date, format: 'yyyy-mm-dd' });
const iso = (d: Date) => d.toISOString().slice(0, 10);

test('import the old sheet: preview, import, and a second import adds nothing', async ({
  page,
}) => {
  const run = Date.now();
  const [d70, d71, d72] = await Promise.all([
    pastDay(page, 70),
    pastDay(page, 71),
    pastDay(page, 72),
  ]);
  const lb = Number((150 + (run % 90) / 10).toFixed(1));
  const sheets: Array<{ sheet: string; data: SheetData }> = [
    {
      sheet: 'Nutrition Log',
      data: [
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
        ],
        [
          cellDay(d70),
          '12:30 PM',
          'Lunch',
          `e2e import ${run}`,
          640,
          45,
          60,
          20,
          'High',
          'photo',
          '',
        ],
        [cellDay(d70), '', 'Snack', 'no calories', null, null, null, null, '', '', ''],
      ],
    },
    {
      sheet: 'Weight Log',
      data: [
        ['Date', 'Weight (lb)'],
        [cellDay(d71), lb],
      ],
    },
    {
      sheet: 'Training Log',
      data: [
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
        [
          cellDay(d72),
          'Upper A',
          'done',
          '',
          '',
          null,
          '',
          `${iso(d72)} 18:00:00`,
          `t${run}`,
          null,
        ],
        [
          cellDay(d72),
          'Upper A',
          'done',
          'Bench Press',
          'up',
          140,
          '',
          `${iso(d72)} 18:00:00`,
          `t${run}`,
          6,
        ],
      ],
    },
    {
      sheet: 'Habits',
      data: [
        ['Habit', 'Id', 'Archive (x to hide)'],
        ['Old habit', `old-${run % 1e6}`, 'x'],
      ],
    },
    {
      sheet: 'Mood Log',
      data: [
        ['Date', 'Time', 'Mood (1-5)', 'Note', 'Logged at', 'Event id'],
        [cellDay(d71), '9:00 AM', 4, `e2e ${run}`, `${iso(d71)} 09:00:00`, `m${run}`],
      ],
    },
  ];
  const buffer = await writeXlsxFile(sheets).toBuffer();
  const file = {
    name: 'HeroArc Health Log.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  };

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  await sheet.locator('[data-import-file]').setInputFiles(file);

  const preview = sheet.locator('[data-import-summary="new"]');
  await expect(preview.locator('[data-import-tab="Nutrition Log"]')).toContainText('1 new');
  await expect(preview.locator('[data-import-tab="Nutrition Log"]')).toContainText(
    '1 skipped: Row 3: no calories',
  );
  await expect(preview.locator('[data-import-tab="Training Log"]')).toContainText('1 entry');
  await expect(preview).toContainText("Oura history (sleep, readiness, steps…) isn't imported");
  // Nothing is written by the preview.
  const before = (await snapshot(page)).mood.log[iso(d71)] ?? [];
  expect(before).not.toContainEqual(expect.objectContaining({ n: `e2e ${run}` }));

  await sheet.locator('[data-import-run]').click();
  await expect(sheet.getByRole('status')).toContainText('Imported 5 entries.');
  const added = sheet.locator('[data-import-summary="added"]');
  await expect(added.locator('[data-import-tab="Weight Log"]')).toContainText('1 added');
  await expect(added.locator('[data-import-tab="Training Log"]')).toContainText('1 added');
  const s = await snapshot(page);
  // (Earlier runs leave weigh-ins on this day too, so only check there is one.)
  expect(typeof s.days[iso(d71)].weight).toBe('number');
  expect(s.days[iso(d70)].kcalIn).toBeGreaterThanOrEqual(640);
  expect(s.mood.log[iso(d71)]).toContainEqual(expect.objectContaining({ m: 4, n: `e2e ${run}` }));

  // The same file again: everything is already there.
  await sheet.locator('[data-import-file]').setInputFiles(file);
  await expect(sheet.locator('[data-import-summary="new"]')).toBeVisible();
  await expect(sheet.locator('[data-import-run]')).toHaveText('Nothing new to import');
  await expect(sheet.locator('[data-import-run]')).toBeDisabled();
});

test('a file that isn’t the old sheet is refused with a clear message', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  const buffer = await writeXlsxFile([
    {
      sheet: 'Budget',
      data: [
        ['Month', 'Spent'],
        ['March', 120],
      ],
    },
  ]).toBuffer();
  await sheet.locator('[data-import-file]').setInputFiles({
    name: 'budget.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await expect(sheet.getByRole('alert')).toContainText("doesn't look like the old HeroArc sheet");
});
