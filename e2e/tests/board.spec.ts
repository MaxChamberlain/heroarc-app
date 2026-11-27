import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

// The responsive board at /. Every write is checked against the API afterwards.
// Tests share the demo user, so layout tests restore the layout they found.
test.use({ serviceWorkers: 'block' });

interface Tile {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden: boolean;
}
interface Layout {
  version: 1;
  cols: 12;
  tiles: Tile[];
}

const APP = { 'x-heroarc': '1' };
const getLayout = async (r: APIRequestContext): Promise<Layout> =>
  (await r.get('/api/v1/layout')).json();
const putLayout = (r: APIRequestContext, l: Layout) =>
  r.put('/api/v1/layout', { data: l, headers: APP });
const order = (l: Layout) =>
  l.tiles
    .filter((t) => !t.hidden)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((t) => t.id);
const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);
const toast = (page: Page) => page.locator('[data-toast]');
/** One keyboard step in a dnd-kit list; it measures and animates between steps. */
const key = async (page: Page, k: string) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(200);
};
const snapshot = async (page: Page) => (await page.request.get('/api/data')).json();

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('character popover shows every gear slot', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-hero]').click();
    const pop = page.getByRole('dialog', { name: 'Your character' });
    await expect(pop).toBeVisible();
    await expect(pop).toContainText('Aura');
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
  });

  test('day navigation: previous day, then back to today', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Today');
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect(page.locator('h1')).not.toHaveText('Today');
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('h1')).toHaveText('Today');
  });

  // Both save the demo account's goals: one at a time, or one overwrites the other.
  test.describe('goals', () => {
    test.describe.configure({ mode: 'serial' });

    test('goals drawer saves new goals', async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-goals-open]').click();
      const sheet = page.getByRole('dialog', { name: 'Your goals' });
      await sheet.locator('[data-gf="kcal"]').fill('2150');
      await sheet.locator('[data-gf="protein"]').fill('125');
      await sheet.locator('[data-gf="age"]').fill('40');
      await sheet.locator('[data-gf="height"]').fill('68');
      await sheet.locator('[data-gf="weight"]').fill('170');
      await sheet.locator('[data-gsave]').click();
      await expect(toast(page)).toContainText('Goals saved');
      await expect(sheet).toBeHidden();
      const s = await snapshot(page);
      expect(s.goals).toMatchObject({ kcal: 2150, protein: 125, goalsSet: true });
    });

    test('goals: tracking fat and carbs shows them on Goals and Nutrition', async ({ page }) => {
      await page.goto('/');
      const open = async () => {
        await page.locator('[data-goals-open]').click();
        const sheet = page.getByRole('dialog', { name: 'Your goals' });
        await sheet.locator('[data-gf="age"]').fill('40');
        await sheet.locator('[data-gf="height"]').fill('68');
        await sheet.locator('[data-gf="weight"]').fill('170');
        await sheet.locator('[data-gf="kcal"]').fill('2150');
        await sheet.locator('[data-gf="protein"]').fill('125');
        return sheet;
      };
      let sheet = await open();
      await sheet.locator('[data-track-macros]').check();
      await sheet.locator('[data-gf="carbs"]').fill('210');
      await sheet.locator('[data-gf="fat"]').fill('70');
      await sheet.locator('[data-gsave]').click();
      await expect(sheet).toBeHidden();
      await expect(tile(page, 'goals')).toContainText('Carbs (g)');
      await expect(tile(page, 'goals')).toContainText('Fat (g)');
      await expect(tile(page, 'nutrition').locator('[data-macro]')).toHaveCount(4);
      expect((await snapshot(page)).goals).toMatchObject({
        carbs: 210,
        fat: 70,
        trackMacros: true,
      });

      sheet = await open();
      await sheet.locator('[data-track-macros]').uncheck();
      await sheet.locator('[data-gsave]').click();
      await expect(sheet).toBeHidden();
      await expect(tile(page, 'nutrition').locator('[data-macro]')).toHaveCount(2);
      // Turning tracking off keeps the saved numbers for next time.
      expect((await snapshot(page)).goals).toMatchObject({
        carbs: 210,
        fat: 70,
        trackMacros: false,
      });
    });
  });

  test('meters: all four in a row on desktop', async ({ page }) => {
    await page.goto('/');
    const ms = tile(page, 'meter').getByRole('meter');
    await expect(ms).toHaveCount(4);
    const ys = await Promise.all(
      [0, 1, 2, 3].map(async (i) => (await ms.nth(i).boundingBox())?.y ?? -1),
    );
    expect(new Set(ys.map(Math.round)).size).toBe(1);
  });

  test('training: open a session two days ago, log a key-lift max, complete it', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Previous day' }).click();
    await page.getByRole('button', { name: 'Previous day' }).click();
    const card = tile(page, 'training');
    const change = card.locator('[data-act="edit"]');
    if (await change.isVisible()) await change.click();
    const s0 = await snapshot(page);
    const workout = s0.training.program.workouts.find(
      (w: { keyLifts: string[] }) => w.keyLifts.length > 0,
    ) as { name: string; keyLifts: string[] };
    await card.locator(`[data-act="pick"][data-v="${workout.name}"]`).click();
    const sheet = page.getByRole('dialog', { name: `${workout.name} session` });
    const lift = workout.keyLifts[0] as string;
    const row = sheet.locator(`[data-l="${lift}"]`);
    await row.locator('[data-act="wt"]').fill('135');
    await row.locator('[data-act="rp"]').fill('');
    await sheet.locator('[data-act="status"][data-v="done"]').click();
    // Weight without reps is refused, with the reps box flagged.
    await expect(sheet).toContainText(`Add reps for ${lift}`);
    await row.locator('[data-act="rp"]').fill('8');
    await sheet.locator('[data-act="status"][data-v="done"]').click();
    await expect(sheet).toBeHidden();
    await expect(card).toContainText('Completed');
    const s = await snapshot(page);
    const d = new Date(`${s.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 2);
    const twoAgo = d.toISOString().slice(0, 10);
    const entry = (
      s.training.log as Array<{ d: string; w: string; s: string; lifts: Record<string, unknown> }>
    ).find((e) => e.d === twoAgo);
    expect(entry).toMatchObject({ w: workout.name, s: 'done' });
    expect(entry?.lifts[lift]).toMatchObject({ wt: 135, reps: 8 });
  });
});

test("themes: switching in Settings restyles the board from that theme's variables", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  await sheet.locator('[data-theme-pick="cyberpunk"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cyberpunk');
  // A string expression: this package's TypeScript has no DOM types.
  const tag = await page.evaluate(
    "getComputedStyle(document.documentElement).getPropertyValue('--card-tag').trim()",
  );
  expect(tag).toBe('"SYS//"');
  // The choice is a cookie, so a reload renders the same theme on the server.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cyberpunk');
  await page.context().clearCookies({ name: 'heroarc_theme' });
});

test('Simple is the default theme, listed first', async ({ page }) => {
  await page.context().clearCookies({ name: 'heroarc_theme' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'simple');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('[data-theme-pick]').first()).toHaveAttribute(
    'data-theme-pick',
    'simple',
  );
});

test('theme gallery shows every card in every theme', async ({ page }) => {
  await page.goto('/dev/themes');
  await expect(page.locator('section[data-theme]')).toHaveCount(8);
  await expect(page.locator('section[data-theme="beige84"] section[aria-labelledby]')).toHaveCount(
    13,
  );
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('meters: two per row on a phone, never three', async ({ page }) => {
    await page.goto('/');
    const ms = tile(page, 'meter').getByRole('meter');
    await expect(ms).toHaveCount(4);
    const b = await Promise.all(
      [0, 1, 2, 3].map(async (i) => (await ms.nth(i).boundingBox()) ?? { x: 0, y: 0 }),
    );
    expect(Math.round(b[0]?.y ?? 0)).toBe(Math.round(b[1]?.y ?? -1));
    expect(Math.round(b[2]?.y ?? 0)).toBe(Math.round(b[3]?.y ?? -1));
    expect(b[2]?.y ?? 0).toBeGreaterThan((b[0]?.y ?? 0) + 10);
  });

  test('quick actions: log a weight and a mood, tick a habit', async ({ page }) => {
    await page.goto('/');
    const dock = page.getByRole('navigation', { name: 'Quick actions' });

    // Log a weight close to the current one, so the demo trend stays believable.
    let s = await snapshot(page);
    const base: number = s.days[s.date]?.weight ?? 150;
    const w = (Math.round(base * 10) / 10 + ((base * 10) % 2 < 1 ? 0.1 : -0.1)).toFixed(1);
    await dock.getByRole('button', { name: 'Weight' }).click();
    const wsheet = page.getByRole('dialog', { name: 'Log weight' });
    await wsheet.getByLabel('Weight in pounds').fill(w);
    await wsheet.locator('[data-weight-save]').click();
    await expect(toast(page)).toContainText(`Saved ${w} lb`);
    await expect(wsheet).toBeHidden();
    s = await snapshot(page);
    expect(s.days[s.date].weight).toBe(Number(w));

    await dock.getByRole('button', { name: 'Mood' }).click();
    const msheet = page.getByRole('dialog', { name: 'Mood check-in' });
    const note = `e2e phone ${Date.now()}`;
    await msheet.getByRole('button', { name: '5 Great' }).click();
    await msheet.getByLabel('Mood note').fill(note);
    await msheet.locator('[data-mood-log]').click();
    await expect(toast(page)).toHaveText('Thanks for sharing.');
    s = await snapshot(page);
    expect(s.mood.log[s.date]).toContainEqual(expect.objectContaining({ m: 5, n: note }));

    await dock.getByRole('button', { name: 'Habits' }).click();
    const hsheet = page.getByRole('dialog', { name: "Today's habits" });
    const first = hsheet.locator('[data-hq]').first();
    const hid = (await first.getAttribute('data-hq')) as string;
    const was = (await first.getAttribute('aria-pressed')) === 'true';
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', String(!was));
    await expect
      .poll(async () => ((await snapshot(page)).habits.log[s.date] ?? []).includes(hid))
      .toBe(!was);
    await first.click();
    await expect
      .poll(async () => ((await snapshot(page)).habits.log[s.date] ?? []).includes(hid))
      .toBe(was);
  });
});

// Layout tests share the demo user's one layout, so they run one at a time and put back
// the layout they found.
test.describe('layout', () => {
  test.describe.configure({ mode: 'serial' });
  let original: Layout;
  test.beforeAll(async ({ request }) => {
    original = await getLayout(request);
  });
  test.afterAll(async ({ request }) => {
    await putLayout(request, original);
  });

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('hide a card, save, reload: it stays hidden; the panel brings it back', async ({
      page,
    }) => {
      await putLayout(page.request, { ...original, tiles: [] });
      await page.goto('/');
      await expect(tile(page, 'thought')).toBeVisible();
      await page.locator('[data-customize]').click();
      await expect(page.getByRole('complementary', { name: 'Customize board' })).toBeVisible();
      await page.locator('[data-hide="thought"]').click();
      await expect(tile(page, 'thought')).toHaveCount(0);
      await page.locator('[data-done]').click();
      await expect(toast(page)).toHaveText('Layout saved.');
      expect((await getLayout(page.request)).tiles.find((t) => t.id === 'thought')?.hidden).toBe(
        true,
      );

      await page.reload();
      await expect(tile(page, 'health')).toBeVisible();
      await expect(tile(page, 'thought')).toHaveCount(0);

      await page.locator('[data-customize]').click();
      await page.locator('[data-switch="thought"]').click();
      await expect(tile(page, 'thought')).toBeVisible();
      await page.locator('[data-done]').click();
      await expect(toast(page)).toHaveText('Layout saved.');
      expect((await getLayout(page.request)).tiles.find((t) => t.id === 'thought')?.hidden).toBe(
        false,
      );
    });

    test('cancel throws changes away', async ({ page }) => {
      await page.goto('/');
      const before = await getLayout(page.request);
      await page.locator('[data-customize]').click();
      await page.locator('[data-hide="goals"]').click();
      await expect(tile(page, 'goals')).toHaveCount(0);
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(tile(page, 'goals')).toBeVisible();
      expect(await getLayout(page.request)).toEqual(before);
    });

    test('drag a tile by its handle and resize it from the corner', async ({ page }) => {
      await putLayout(page.request, { ...original, tiles: [] });
      await page.goto('/');
      await page.locator('[data-customize]').click();

      // Make Health wider (wait for the board to settle first).
      await page.waitForTimeout(400);
      const corner = tile(page, 'health').locator('.react-resizable-handle');
      const cb = await corner.boundingBox();
      if (!cb) throw new Error('no resize handle');
      await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++)
        await page.mouse.move(cb.x + cb.width / 2 + i * 25, cb.y + cb.height / 2);
      await page.mouse.up();

      await page.waitForTimeout(400);
      // Drag Goals (middle column) over to the left column.
      const handle = tile(page, 'goals').getByTitle('Drag to move');
      const hb = await handle.boundingBox();
      if (!hb) throw new Error('no handle');
      await page.mouse.move(hb.x + 20, hb.y + hb.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++)
        await page.mouse.move(hb.x + 20 - i * 45, hb.y + hb.height / 2 + i * 2);
      await page.mouse.up();

      await page.locator('[data-done]').click();
      await expect(toast(page)).toHaveText('Layout saved.');
      const saved = await getLayout(page.request);
      const goals = saved.tiles.find((t) => t.id === 'goals');
      const health = saved.tiles.find((t) => t.id === 'health');
      expect(goals?.x).toBe(0);
      expect(health?.w).toBeGreaterThan(4);
    });

    test('Coach rearranges the dashboard only after Apply, and Undo puts it back', async ({
      page,
    }) => {
      const status = await (await page.request.get('/api/v1/coach/status')).json();
      test.skip(!status.scripted, 'needs the API running with COACH_MODEL=fake');
      await putLayout(page.request, { ...original, tiles: [] });
      await page.goto('/');
      await page.locator('[data-coach-menu]').click();
      await page.locator('[data-new-chat]').click();
      await page.getByRole('textbox', { name: 'Message Coach' }).fill('hide the moodTrend card');
      await page.keyboard.press('Enter');
      const proposal = page
        .locator('[data-receipt="pending"][data-tool="arrange_dashboard"]')
        .last();
      await expect(proposal).toContainText('hide Mood, 14 days');
      // Nothing changes until Apply.
      await expect(tile(page, 'moodTrend')).toBeVisible();
      await proposal.getByRole('button', { name: 'Apply' }).click();
      await expect(tile(page, 'moodTrend')).toHaveCount(0);
      expect((await getLayout(page.request)).tiles.find((t) => t.id === 'moodTrend')?.hidden).toBe(
        true,
      );
      const applied = page
        .locator('[data-receipt="applied"][data-tool="arrange_dashboard"]')
        .last();
      await applied.getByRole('button', { name: 'Undo' }).click();
      await expect(tile(page, 'moodTrend')).toBeVisible();
    });

    test('reorder from the panel with the keyboard re-packs the board', async ({ page }) => {
      await putLayout(page.request, { ...original, tiles: [] });
      await page.goto('/');
      await page.locator('[data-customize]').click();
      const before = order(await getLayout(page.request));
      const first = before[0] as string;
      await page.getByRole('button', { name: `Move ${'Meters'}` }).focus();
      await key(page, 'Space');
      await key(page, 'ArrowDown');
      await key(page, 'ArrowDown');
      await key(page, 'Space');
      await page.locator('[data-done]').click();
      await expect(toast(page)).toHaveText('Layout saved.');
      const after = order(await getLayout(page.request));
      expect(after.indexOf(first)).toBe(2);
      expect(after.slice(0, 2)).toEqual(before.slice(1, 3));
    });
  });

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('the list sheet hides cards and reorders the board', async ({ page }) => {
      await putLayout(page.request, { ...original, tiles: [] });
      await page.goto('/');
      await page.locator('[data-customize]').click();
      const sheet = page.getByRole('dialog', { name: 'Customize' });
      await sheet.locator('[data-switch="energy"]').click();
      await sheet.getByRole('button', { name: 'Move Health' }).focus();
      await key(page, 'Space');
      await key(page, 'ArrowUp');
      await key(page, 'Space');
      await sheet.locator('[data-done]').click();
      await expect(toast(page)).toHaveText('Layout saved.');
      const saved = await getLayout(page.request);
      expect(saved.tiles.find((t) => t.id === 'energy')?.hidden).toBe(true);
      expect(order(saved)[0]).toBe('health');
      await expect(tile(page, 'energy')).toHaveCount(0);
      // The phone stack follows the board's reading order.
      const ids = await page
        .locator('[data-tile]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-tile')));
      expect(ids.slice(0, 2)).toEqual(order(saved).slice(0, 2));
    });
  });
});

test('Settings → People: an admin creates an invite link and revokes it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  await expect(sheet).toContainText('Account');
  await sheet.locator('[data-invite]').click();
  const link = sheet.locator('[data-invite-url]');
  await expect(link).toContainText('/invite/');
  const code = ((await link.textContent()) ?? '').split('/invite/')[1] as string;
  expect((await (await page.request.get(`/api/v1/invites/${code}`)).json()).valid).toBe(true);
  // Exactly this invite: auth tests create link invites at the same time.
  await sheet
    .locator(`[data-invite-code="${code}"]`)
    .getByRole('button', { name: 'Revoke' })
    .click();
  await expect
    .poll(async () => (await (await page.request.get(`/api/v1/invites/${code}`)).json()).valid)
    .toBe(false);
});
