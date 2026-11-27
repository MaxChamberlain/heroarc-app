import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { rpcBody } from './mcp.js';

// Outside agents: an API key made in Settings → Connections, used against the API directly
// (as n8n, Hermes or a script would), with results checked on the board and in Agent activity.
test.use({ serviceWorkers: 'block' });
test.describe.configure({ mode: 'serial' });

const API = process.env.E2E_API_URL ?? process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
const snapshot = async (page: Page) => (await page.request.get('/api/data')).json();
/** A past day of its own per test, so tests running alongside can't interfere. */
async function pastDay(page: Page, back: number): Promise<string> {
  const d = new Date(`${(await snapshot(page)).date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
const lbFor = () => Number((150 + Math.round(Math.random() * 90) / 10).toFixed(1));

const NO_COOKIES = { cookies: [], origins: [] };
let key = '';
let agent: APIRequestContext;

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

test.afterAll(async () => {
  await agent?.dispose();
});

test('Settings → Connections: a new key is shown once, with how to connect', async ({
  page,
  playwright,
}) => {
  const sheet = await openSettings(page);
  const name = `e2e ${Date.now()}`;
  await sheet.getByLabel('Key name').fill(name);
  await sheet.locator('[data-new-key]').click();
  const secret = sheet.locator('[data-key-secret]');
  await expect(secret).toHaveText(/^hak_[\w-]{40,}$/);
  key = ((await secret.textContent()) ?? '').trim();
  await expect(sheet.locator('[data-new-key-panel]')).toContainText('/api/agent/v1/openapi.json');
  await expect(sheet.locator(`[data-key="${name}"]`)).toContainText('not used yet');
  // Only its start is listed once the panel is closed.
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).not.toContainText(key);
  // A real agent has no browser cookies (localhost cookies would reach every port).
  agent = await playwright.request.newContext({
    baseURL: API,
    storageState: NO_COOKIES,
    extraHTTPHeaders: { authorization: `Bearer ${key}` },
  });
});

test('REST: an agent logs a weigh-in; Undo in Agent activity removes it', async ({ page }) => {
  const day = await pastDay(page, 30);
  const before = (await snapshot(page)).days[day]?.weight ?? null;
  const lb = lbFor();
  const tools = await (await agent.get('/api/agent/v1/tools')).json();
  expect(tools.tools.map((t: { name: string }) => t.name)).toContain('log_weight');

  const r = await agent.post('/api/agent/v1/tools/log_weight', { data: { lb, date: day } });
  expect(r.ok(), await r.text()).toBe(true);
  const { receipt } = await r.json();
  expect(receipt.status).toBe('applied');
  expect((await snapshot(page)).days[day].weight).toBe(lb);

  const sheet = await openSettings(page);
  const row = sheet.locator(`[data-activity="recent"] [data-action="${receipt.actionId}"]`);
  await expect(row).toContainText(`Logged ${lb.toFixed(1)} lb`);
  await expect(row).toContainText('e2e');
  await row.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await snapshot(page)).days[day]?.weight ?? null).toBe(before);
});

test('REST: an edit waits for approval (badge on Settings), then Apply changes it', async ({
  page,
}) => {
  const day = await pastDay(page, 31);
  const first = lbFor();
  await agent.post('/api/agent/v1/tools/log_weight', { data: { lb: first, date: day } });
  const got = await (
    await agent.post('/api/agent/v1/tools/get_day', { data: { date: day } })
  ).json();
  const id = got.result.weigh_ins.at(-1).id;
  // A different weight from the one logged, so the change is visible.
  const lb = Number((first + 0.5).toFixed(1));
  const r = await (
    await agent.post('/api/agent/v1/tools/edit_record', {
      data: { kind: 'weight', id, changes: { lb } },
    })
  ).json();
  expect(r.receipt.status).toBe('pending');
  expect(r.result).toContain('Waiting for the user to approve');
  expect((await snapshot(page)).days[day].weight).not.toBe(lb);

  await page.goto('/');
  await expect(
    page.getByRole('button', { name: /Settings \(\d+ waiting for you\)/ }),
  ).toBeVisible();
  const sheet = await openSettings(page);
  const proposal = sheet.locator(`[data-activity="pending"] [data-action="${r.receipt.actionId}"]`);
  await expect(proposal).toContainText(`→ ${lb}`);
  await proposal.getByRole('button', { name: 'Apply' }).click();
  await expect.poll(async () => (await snapshot(page)).days[day].weight).toBe(lb);
});

test('the original Hermes API works with the same key; Oura fields stay empty', async ({
  page,
}) => {
  const day = await pastDay(page, 32);
  const w = await agent.post('/weight', { data: { lb: '151.3', date: day } });
  expect(await w.json()).toEqual({ ok: true, result: expect.stringContaining('151.3 lb') });
  expect((await snapshot(page)).days[day].weight).toBe(151.3);

  const dry = await (
    await agent.post('/food', {
      data: { meal: 'lunch', items: 'e2e salad', kcal: '400', p: 20, c: 30, f: 15, dry_run: true },
    })
  ).json();
  expect(dry).toMatchObject({ ok: true, result: expect.stringContaining('Dry run') });

  const today = await (await agent.get('/today')).json();
  expect(today.ok).toBe(true);
  expect(today.date).toBe((await snapshot(page)).date);
  for (const k of ['steps', 'activeKcal', 'readiness', 'sleep', 'sleepHours', 'hrv', 'rhr'])
    expect(today.today[k], k).toBeNull();
  expect(today.ouraDay).toBeNull();

  const bad = await agent.post('/food', { data: { meal: 'brunch' } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).ok).toBe(false);
});

test('MCP: a client lists the tools and logs through them with the key', async ({ page }) => {
  const day = await pastDay(page, 33);
  const rpc = async (id: number, method: string, params?: object) =>
    rpcBody(
      await agent.post('/mcp', {
        headers: {
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-06-18',
        },
        data: { jsonrpc: '2.0', id, method, ...(params && { params }) },
      }),
    );
  const init = await rpc(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'e2e', version: '1' },
  });
  expect(init.result.serverInfo.name).toBe('heroarc');
  const names = (await rpc(2, 'tools/list')).result.tools.map((t: { name: string }) => t.name);
  expect(names).toContain('log_weight');
  expect(names).not.toContain('set_theme');

  const lb = lbFor();
  const call = await rpc(3, 'tools/call', { name: 'log_weight', arguments: { lb, date: day } });
  expect(call.result.content[0].text).toContain(`Logged ${lb.toFixed(1)} lb`);
  expect((await snapshot(page)).days[day].weight).toBe(lb);
});

test('keys only open the agent API, sessions never do, and Revoke stops a key at once', async ({
  page,
  playwright,
}) => {
  expect((await agent.get('/api/data')).status()).toBe(401);
  expect((await page.request.get('/api/agent/v1/tools')).status()).toBe(401);
  const anon = await playwright.request.newContext({ baseURL: API, storageState: NO_COOKIES });
  expect((await anon.get('/today')).status()).toBe(401);
  await anon.dispose();

  const sheet = await openSettings(page);
  // Revoke every e2e key (this run's included).
  const keys = sheet.locator('[data-key^="e2e "]');
  await expect(keys.first()).toBeVisible();
  for (let n = await keys.count(); n > 0; n--) {
    await keys.first().getByRole('button', { name: 'Revoke' }).click();
    await expect(keys).toHaveCount(n - 1);
  }
  await expect.poll(async () => (await agent.get('/today')).status()).toBe(401);
});
