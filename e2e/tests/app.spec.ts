import { expect, test } from '@playwright/test';

// The HeroArc board at /, on the NestJS API + Postgres.
test.use({ serviceWorkers: 'block' });

test('renders the board from /api/data with no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText(/Today/i);
  await expect(page.locator('[data-tile]').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible();
  await expect(page.locator('[data-hero] svg')).toBeVisible();
  expect(errors).toEqual([]);
});

test('/next (the preview address) redirects to the board', async ({ page }) => {
  await page.goto('/next');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-tile]').first()).toBeVisible();
});

test('writes without the app header are refused', async ({ request }) => {
  const res = await request.post('/api/weight', {
    data: { id: 'e2e-noheader', d: '2026-01-01', w: 150 },
  });
  expect(res.status()).toBe(403);
});
