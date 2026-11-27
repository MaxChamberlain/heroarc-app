import { expect, test } from '@playwright/test';

test('web liveness probe responds', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

test('API deep health is reachable through the web /api proxy', async ({ request }) => {
  const res = await request.get('/api/v1/system/health');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body).toMatchObject({ ok: true, service: 'heroarc-api', checks: { db: 'ok', kv: 'ok' } });
});

test('status page shows the API as healthy', async ({ page }) => {
  await page.goto('/status');
  await expect(page.getByRole('heading', { name: 'HeroArc' })).toBeVisible();
  await expect(page.getByTestId('api-status')).toHaveText('API: ok');
});
