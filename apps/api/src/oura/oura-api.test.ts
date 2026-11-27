import { describe, expect, it, vi } from 'vitest';
import { HttpOuraApi, OuraAuthError, OuraRateLimitError, OuraScopeError } from './oura-api.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(...replies: Response[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return replies.shift() ?? json(500, {});
  }) as unknown as typeof fetch;
  return { api: new HttpOuraApi('cid', 'csecret', fetchFn), calls };
}

describe('HttpOuraApi', () => {
  it('asks for the daily and stress scopes, with PKCE', () => {
    const { api } = setup();
    const u = new URL(
      api.authorizeUrl({ state: 'st', challenge: 'ch', redirectUri: 'https://app.x/cb' }),
    );
    expect(u.origin + u.pathname).toBe('https://cloud.ouraring.com/oauth/authorize');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'cid',
      redirect_uri: 'https://app.x/cb',
      scope: 'daily stress',
      state: 'st',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
    });
  });

  it('exchanges the code with the verifier and refreshes (single-use refresh tokens)', async () => {
    const { api, calls } = setup(
      json(200, {
        access_token: 'a1',
        refresh_token: 'r1',
        expires_in: 86400,
        scope: 'daily stress',
      }),
      json(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 }),
    );
    expect(
      await api.exchange({ code: 'c', verifier: 'v', redirectUri: 'https://app.x/cb' }),
    ).toEqual({
      accessToken: 'a1',
      refreshToken: 'r1',
      expiresIn: 86400,
      scopes: ['daily', 'stress'],
    });
    const body = new URLSearchParams(String(calls[0]?.init?.body));
    expect(calls[0]?.url).toBe('https://api.ouraring.com/oauth/token');
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'c',
      code_verifier: 'v',
      client_id: 'cid',
      client_secret: 'csecret',
    });
    expect(await api.refresh('r1')).toMatchObject({
      accessToken: 'a2',
      refreshToken: 'r2',
      scopes: null,
    });
    expect(Object.fromEntries(new URLSearchParams(String(calls[1]?.init?.body)))).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
    });
  });

  it('a refused grant means reconnecting', async () => {
    const { api } = setup(
      json(400, { error: 'invalid_grant', error_description: 'Token Already Used Or Revoked' }),
    );
    await expect(api.refresh('r1')).rejects.toThrow(OuraAuthError);
  });

  it('follows next_token pages and sends a User-Agent', async () => {
    const { api, calls } = setup(
      json(200, { data: [{ day: '2026-11-01', score: 80 }], next_token: 'p2' }),
      json(200, { data: [{ day: '2026-11-02', score: 81 }], next_token: null }),
    );
    const rows = await api.collection('tok', 'daily_sleep', '2026-11-01', '2026-11-02');
    expect(rows.map((r) => r.day)).toEqual(['2026-11-01', '2026-11-02']);
    const u2 = new URL(calls[1]?.url ?? '');
    expect(u2.pathname).toBe('/v2/usercollection/daily_sleep');
    expect(u2.searchParams.get('next_token')).toBe('p2');
    const h = calls[0]?.init?.headers as Record<string, string>;
    expect(h.authorization).toBe('Bearer tok');
    expect(h['user-agent']).toMatch(/^HeroArc\//);
  });

  it('tells a missing scope from a bad token, and notices the rate limit', async () => {
    const { api } = setup(
      json(403, { detail: 'Missing Scopes: stress' }),
      json(401, { detail: 'Invalid token' }),
      json(429, {}),
    );
    await expect(api.collection('t', 'daily_stress', 'a', 'b')).rejects.toThrow(OuraScopeError);
    await expect(api.collection('t', 'daily_sleep', 'a', 'b')).rejects.toThrow(OuraAuthError);
    await expect(api.collection('t', 'daily_sleep', 'a', 'b')).rejects.toThrow(OuraRateLimitError);
  });
});
