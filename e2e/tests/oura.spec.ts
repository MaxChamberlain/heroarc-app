import { expect, test } from '@playwright/test';
import { newAccount } from './mail.js';

// Oura with the scripted stand-in (OURA_CLIENT_ID=fake, as in CI): connect from Settings, the
// history arrives, Sync now, and Disconnect deletes the Oura data. A fresh account keeps the
// demo data out of it.
test.use({ serviceWorkers: 'block' });

test('connect Oura, see its history on the board, sync, and disconnect (which deletes it)', async ({
  page,
  browser,
  baseURL,
}) => {
  const status = await (await page.request.get('/api/v1/oura')).json();
  test.skip(
    !status.available,
    'needs the API running with OURA_CLIENT_ID=fake (or a real Oura app)',
  );

  const { ctx } = await newAccount(browser, baseURL ?? '', page.request, 'oura');
  const p = await ctx.newPage();
  const ouraStatus = async () => (await p.request.get('/api/v1/oura')).json();
  const snapshot = async () => (await p.request.get('/api/data')).json();

  await p.goto('/');
  await p.getByRole('button', { name: 'Settings' }).click();
  const sheet = p.getByRole('dialog', { name: 'Settings' });
  await expect(sheet.locator('[data-oura="off"]')).toContainText('Connect your Oura ring');
  await sheet.locator('[data-oura-connect]').click();

  // Oura's (scripted) consent, the callback, and back to the board, which says so.
  await expect(p).toHaveURL((u) => u.pathname === '/' && !u.search.includes('oura='));
  // (The scripted Oura is quick, so the second message may already have replaced the first.)
  await expect(
    p.getByText(/^(Oura connected\. Fetching your history…|Your Oura history is in\.)$/),
  ).toBeVisible();
  await expect.poll(async () => (await ouraStatus()).lastSyncAt, { timeout: 30_000 }).toBeTruthy();
  const st = await ouraStatus();
  expect(st).toMatchObject({ connected: true, status: 'ok', missingScopes: [] });
  // Two years of history, today included.
  const today = (await snapshot()).date as string;
  const twoYears = new Date(`${today}T12:00:00Z`);
  twoYears.setUTCDate(twoYears.getUTCDate() - 730);
  expect(st.syncedFrom).toBe(twoYears.toISOString().slice(0, 10));
  const s = await snapshot();
  expect(s.days[today]).toMatchObject({
    sleep: expect.any(Number),
    readiness: expect.any(Number),
    hrv: expect.any(Number),
    steps: expect.any(Number),
  });
  expect(s.days[today].sleep).toBeGreaterThanOrEqual(60);

  await p.getByRole('button', { name: 'Settings' }).click();
  await expect(sheet.locator('[data-oura-state]')).toContainText(`history from ${st.syncedFrom}`);
  await sheet.locator('[data-oura-sync]').click();
  await expect(sheet.getByRole('status').filter({ hasText: /^Synced \d+ days?\.$/ })).toBeVisible();

  await sheet.locator('[data-oura-disconnect]').click();
  await sheet.locator('[data-oura-disconnect-confirm]').click();
  await expect(sheet.locator('[data-oura="off"]')).toBeVisible();
  expect((await ouraStatus()).connected).toBe(false);
  const after = await snapshot();
  expect(after.days[today]?.sleep ?? null).toBeNull();
  await ctx.close();
});
