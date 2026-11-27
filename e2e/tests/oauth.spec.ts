import { createHash, randomBytes } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { rpcBody } from './mcp.js';

// An MCP client that signs in (as Claude or ChatGPT connectors do): discovery from /mcp's 401,
// client registration, authorization code + PKCE with the user's consent, then /mcp with the
// token, and Disconnect in Settings ending its access.
test.use({ serviceWorkers: 'block' });

const API = process.env.E2E_API_URL ?? process.env.INTERNAL_API_URL ?? 'http://localhost:4000';
const REDIRECT = 'http://127.0.0.1:8976/callback';
const NO_COOKIES = { cookies: [], origins: [] };
const b64url = (b: Buffer) => b.toString('base64url');
const snapshot = async (page: Page) => (await page.request.get('/api/data')).json();

test('an MCP client signs in with OAuth, logs through /mcp, and Disconnect ends it', async ({
  page,
  playwright,
}) => {
  const client = await playwright.request.newContext({ storageState: NO_COOKIES });
  const mcp = (token: string, id: number, method: string, params?: object) =>
    client.post(`${API}/mcp`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
      },
      data: { jsonrpc: '2.0', id, method, ...(params && { params }) },
    });

  // 1. Discovery: /mcp → protected resource metadata → authorization server metadata.
  const denied = await client.post(`${API}/mcp`, { data: {} });
  expect(denied.status()).toBe(401);
  const metaUrl = /resource_metadata="([^"]+)"/.exec(
    denied.headers()['www-authenticate'] ?? '',
  )?.[1];
  expect(metaUrl).toBeTruthy();
  const resource = await (await client.get(metaUrl as string)).json();
  expect(resource.resource).toBe(`${API}/mcp`);
  const issuer: string = resource.authorization_servers[0];
  const as = await (
    await client.get(
      `${new URL(issuer).origin}/.well-known/oauth-authorization-server${new URL(issuer).pathname}`,
    )
  ).json();
  expect(as.issuer).toBe(issuer);

  // 2. Register (dynamic client registration, as older MCP clients do).
  const name = `E2E MCP ${Date.now() % 1e6}`;
  const reg = await (
    await client.post(as.registration_endpoint, {
      data: {
        client_name: name,
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
    })
  ).json();
  expect(reg.client_id).toBeTruthy();

  // 3. Authorize with PKCE as the signed-in demo user, and allow it on the consent page.
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(8));
  const authorize = new URL(as.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: 'code',
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'openid offline_access',
    state,
    resource: `${API}/mcp`,
  }))
    authorize.searchParams.set(k, v);
  let callback = '';
  await page.route(`${REDIRECT}**`, (route) => {
    callback = route.request().url();
    return route.fulfill({ status: 200, body: 'ok' });
  });
  await page.goto(authorize.toString());
  await expect(page).toHaveURL(/\/connect\/consent\?/);
  await expect(page.getByRole('heading', { name: `Connect ${name}?` })).toBeVisible();
  await expect(page.locator('[data-consent]')).toContainText('Log new entries');
  await page.getByRole('button', { name: 'Allow' }).click();
  await expect.poll(() => callback).toContain('code=');
  const cb = new URL(callback);
  expect(cb.searchParams.get('state')).toBe(state);

  // 4. Exchange the code for tokens.
  const tok = await (
    await client.post(as.token_endpoint, {
      form: {
        grant_type: 'authorization_code',
        code: cb.searchParams.get('code') as string,
        redirect_uri: REDIRECT,
        client_id: reg.client_id,
        code_verifier: verifier,
        resource: `${API}/mcp`,
      },
    })
  ).json();
  expect(tok.access_token, JSON.stringify(tok)).toBeTruthy();
  const token: string = tok.access_token;

  // 5. Use it on /mcp: log a weigh-in, recorded as the app.
  const init = await rpcBody(
    await mcp(token, 1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '1' },
    }),
  );
  expect(init.result.serverInfo.name).toBe('heroarc');
  const d = new Date(`${(await snapshot(page)).date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 34);
  const day = d.toISOString().slice(0, 10);
  const lb = Number((150 + Math.round(Math.random() * 90) / 10).toFixed(1));
  const call = await rpcBody(
    await mcp(token, 2, 'tools/call', { name: 'log_weight', arguments: { lb, date: day } }),
  );
  expect(call.result.content[0].text).toContain(`Logged ${lb.toFixed(1)} lb`);
  expect((await snapshot(page)).days[day].weight).toBe(lb);
  // The token is for /mcp only.
  const rest = await client.get(`${API}/api/agent/v1/tools`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(rest.status()).toBe(401);

  // 6. Settings shows the app; Disconnect ends its access at once.
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  await expect(sheet.locator('[data-activity="recent"]')).toContainText(name);
  const app = sheet.locator(`[data-app="${name}"]`);
  await expect(app).toContainText('127.0.0.1:8976');
  await app.getByRole('button', { name: 'Disconnect' }).click();
  await expect(app).toHaveCount(0);
  await expect.poll(async () => (await mcp(token, 3, 'tools/list')).status()).toBe(401);
  await client.dispose();
});
