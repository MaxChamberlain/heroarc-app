import { type APIRequestContext, type Browser, expect } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** The first link in the newest email to `to` that contains `part` (read from Mailpit). */
export async function linkFromEmail(
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

/**
 * A fresh, confirmed, onboarded account in its own browser context, signed in. `admin` is a
 * request context signed in as an admin (the demo account), to make the invite.
 */
export async function newAccount(
  browser: Browser,
  baseURL: string,
  admin: APIRequestContext,
  prefix: string,
) {
  const inv = await (
    await admin.post('/api/v1/invites', { data: {}, headers: { 'x-heroarc': '1' } })
  ).json();
  const ctx = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const n = `${prefix}${Date.now() % 1e8}`;
  const email = `${n}@example.com`;
  const up = await ctx.request.post('/api/auth/sign-up/email', {
    data: { name: 'Test Person', email, username: n, password: 'a-long-enough-password' },
    headers: { origin: baseURL, cookie: `heroarc_invite=${inv.code}` },
  });
  expect(up.ok(), await up.text()).toBe(true);
  // Confirming the email signs the account in (this context gets the session cookie).
  const confirm = new URL(await linkFromEmail(ctx.request, email, '/verify-email'));
  await ctx.request.get(confirm.pathname + confirm.search);
  const ok = await ctx.request.patch('/api/v1/me', {
    data: { onboarded: true },
    headers: { 'x-heroarc': '1' },
  });
  expect(ok.ok(), await ok.text()).toBe(true);
  return { ctx, email };
}
