import { type APIRequestContext, expect, test } from '@playwright/test';

// Sign-in and invite-only sign-up, starting signed out. Emails are read from Mailpit.
test.use({ serviceWorkers: 'block' });

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const DEMO = {
  username: process.env.DEMO_USERNAME ?? 'demo',
  password: process.env.DEMO_PASSWORD ?? 'heroarc-demo-password',
};

/** The first link in the newest email to `to` that contains `part`. */
async function linkFromEmail(
  request: APIRequestContext,
  to: string,
  part: string,
): Promise<string> {
  let link = '';
  await expect
    .poll(
      async () => {
        const list = await (
          await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
        ).json();
        const id = list.messages?.[0]?.ID;
        if (!id) return '';
        const msg = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
        link =
          (String(msg.Text).match(/https?:\/\/\S+/g) ?? []).find((u) => u.includes(part)) ?? '';
        return link;
      },
      { timeout: 10_000 },
    )
    .not.toBe('');
  return link;
}

test('the board sends you to sign in, and signing in brings you back', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel('Email or username').fill(DEMO.username);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('[data-tile]').first()).toBeVisible();
});

test('a wrong password is refused', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email or username').fill(DEMO.username);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('sign-up needs an invite', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/sign-up');
  await expect(page.getByRole('heading', { name: 'HeroArc is invite-only' })).toBeVisible();
  await page.goto('/invite/not-a-real-invite-code');
  await expect(page.getByRole('heading', { name: "This invite doesn't work" })).toBeVisible();
});

test('the API refuses sign-up without a usable invite, and an invite works once', async ({
  playwright,
  baseURL,
}) => {
  const anon = await playwright.request.newContext({ baseURL });
  const origin = { origin: baseURL ?? '' };
  const body = (n: string) => ({
    name: 'Someone',
    email: `${n}-${Date.now()}@example.com`,
    password: 'a-long-enough-password',
    username: `${n}_${Date.now() % 1e8}`,
  });
  const none = await anon.post('/api/auth/sign-up/email', {
    data: body('noinvite'),
    headers: origin,
  });
  expect(none.status()).toBe(403);

  // A link invite (no email) works for one sign-up only.
  const admin = await playwright.request.newContext({ baseURL });
  await admin.post('/api/auth/sign-in/username', { data: DEMO, headers: origin });
  const inv = await (
    await admin.post('/api/v1/invites', { data: {}, headers: { 'x-heroarc': '1' } })
  ).json();
  const cookie = { ...origin, cookie: `heroarc_invite=${inv.code}` };
  expect(
    (await anon.post('/api/auth/sign-up/email', { data: body('first'), headers: cookie })).ok(),
  ).toBe(true);
  const again = await anon.post('/api/auth/sign-up/email', {
    data: body('second'),
    headers: cookie,
  });
  expect(again.status()).toBe(403);
  await anon.dispose();
  await admin.dispose();
});

test('invite → sign up → confirm email → onboarding → board, then sign out', async ({
  page,
  playwright,
  baseURL,
}) => {
  // An admin (the demo account) creates the invite.
  const admin = await playwright.request.newContext({ baseURL });
  expect(
    (
      await admin.post('/api/auth/sign-in/username', {
        data: DEMO,
        headers: { origin: baseURL ?? '' },
      })
    ).ok(),
  ).toBe(true);
  const email = `new-${Date.now()}@example.com`;
  const inv = await (
    await admin.post('/api/v1/invites', { data: { email }, headers: { 'x-heroarc': '1' } })
  ).json();
  expect(inv.url).toContain('/invite/');
  // The invite was emailed too.
  const invited = await linkFromEmail(admin, email, '/invite/');
  expect(new URL(invited).pathname).toBe(new URL(inv.url).pathname);

  await page.goto(new URL(inv.url).pathname);
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByLabel('Email')).toHaveValue(email);
  await page.getByLabel('Your name').fill('New Person');
  await page.getByLabel('Username').fill(`new_${Date.now() % 1e8}`);
  await page.getByLabel(/^Password/).fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const verify = await linkFromEmail(admin, email, '/verify-email');
  const u = new URL(verify);
  await page.goto(u.pathname + u.search);
  await expect(page).toHaveURL(/\/onboarding$/);

  // Onboarding: you → look → goals → habits → connect.
  await page.getByLabel('What should we call you?').fill('New Person');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Pick your look' })).toBeVisible();
  await page.locator('[data-pick-theme="night"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.getByRole('button', { name: /^Next: Night it is/ }).click();
  await expect(page.getByRole('heading', { name: 'Your daily goals' })).toBeVisible();
  await page.locator('[data-goals-skip]').click();
  await expect(page.getByRole('heading', { name: 'Habits to track' })).toBeVisible();
  await page.getByRole('button', { name: 'Stretch 10 minutes' }).click();
  await page.getByLabel('Your own habit').fill('Walk the dog');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('[data-habits-save]').click();
  await expect(page.getByRole('heading', { name: 'Bring things in' })).toBeVisible();
  // Oura is offered here when the server has an Oura application (CI: the scripted one).
  if ((await (await page.request.get('/api/v1/oura')).json()).available)
    await expect(page.locator('[data-oura-connect]')).toBeVisible();
  await page.getByRole('button', { name: 'Go to my dashboard' }).click();
  await expect(page.locator('[data-tile]').first()).toBeVisible();

  // A brand-new account sees its own board, with what onboarding set.
  const me = await (await page.request.get('/api/v1/me')).json();
  expect(me).toMatchObject({ email, role: 'member', onboarded: true, theme: 'night' });
  const data = await (await page.request.get('/api/data')).json();
  expect(data.habits.list.map((x: { n: string }) => x.n)).toEqual([
    'Stretch 10 minutes',
    'Walk the dog',
  ]);

  // The theme follows the account: another device (no theme cookie yet) switches to it.
  const other = await page.context().browser()?.newContext({ serviceWorkers: 'block' });
  if (other) {
    const session = (await page.context().cookies()).filter((c) => c.name.includes('session'));
    await other.addCookies(session);
    const p2 = await other.newPage();
    await p2.goto(new URL('/', page.url()).toString());
    await expect(p2.locator('[data-tile]').first()).toBeVisible();
    await expect(p2.locator('html')).toHaveAttribute('data-theme', 'night');
    await other.close();
  }
  const used = await (await admin.get('/api/v1/invites')).json();
  expect(used.find((i: { code: string }) => i.code === inv.code)?.usedAt).toBeTruthy();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('[data-sign-out]').click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await admin.dispose();
});

test('forgot password: the emailed link sets a new one', async ({ page, playwright, baseURL }) => {
  // A fresh, confirmed account (via an invite), so the demo password never changes.
  const origin = { origin: baseURL ?? '' };
  const admin = await playwright.request.newContext({ baseURL });
  await admin.post('/api/auth/sign-in/username', { data: DEMO, headers: origin });
  const inv = await (
    await admin.post('/api/v1/invites', { data: {}, headers: { 'x-heroarc': '1' } })
  ).json();
  const acct = {
    name: 'Forgetful',
    email: `reset-${Date.now()}@example.com`,
    username: `reset_${Date.now() % 1e8}`,
    password: 'the-first-password',
  };
  const anon = await playwright.request.newContext({ baseURL });
  const up = await anon.post('/api/auth/sign-up/email', {
    data: acct,
    headers: { ...origin, cookie: `heroarc_invite=${inv.code}` },
  });
  expect(up.ok(), await up.text()).toBe(true);
  const confirm = new URL(await linkFromEmail(admin, acct.email, '/verify-email'));
  expect(
    (await anon.get(confirm.pathname + confirm.search, { maxRedirects: 0 })).status(),
  ).toBeLessThan(400);

  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(acct.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('reset link is on its way');
  const reset = new URL(await linkFromEmail(admin, acct.email, '/reset-password'));
  await page.goto(reset.pathname + reset.search);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel(/New password/).fill('the-second-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel('Email or username').fill(acct.username);
  await page.getByLabel('Password').fill('the-first-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Password').fill('the-second-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await anon.dispose();
  await admin.dispose();
});

test('a refused Google sign-in explains the invite rule', async ({ page }) => {
  await page.goto('/sign-in?error=unable_to_create_user');
  await expect(page.getByRole('alert')).toContainText('invite-only');
});

test("an app's failed sign-in says what went wrong, not Google", async ({ page }) => {
  await page.goto('/sign-in?error=invalid_client&error_description=client+not+found');
  await expect(page.getByRole('alert')).toContainText('client not found');
  await expect(page.getByRole('alert')).not.toContainText('Google');
});
