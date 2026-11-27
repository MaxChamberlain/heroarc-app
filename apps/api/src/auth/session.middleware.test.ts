import { describe, expect, it, vi } from 'vitest';
import { CurrentUserService } from '../user/current-user.service.js';
import { requestContext } from './request-context.js';
import { SessionMiddleware } from './session.middleware.js';

type Fn = (...a: unknown[]) => unknown;

/** A fake DB whose profile lookup returns `profile`. */
function fakeDb(profile: Record<string, unknown> | undefined) {
  const rows = profile ? [profile] : [];
  const chain = { from: () => chain, where: async () => rows };
  return {
    db: {
      select: () => chain,
      insert: () => ({
        values: () => ({ onConflictDoNothing: () => ({ returning: async () => rows }) }),
      }),
    },
  };
}

function run(
  path: string,
  opts: { method?: string; session?: unknown; profile?: Record<string, unknown> } = {},
) {
  const auth = { api: { getSession: vi.fn(async () => opts.session ?? null) } };
  const mw = new SessionMiddleware(auth as never, fakeDb(opts.profile) as never);
  const res = { statusCode: 200, body: undefined as unknown } as {
    statusCode: number;
    body: unknown;
    status: Fn;
    json: Fn;
  };
  res.status = (c) => {
    res.statusCode = c as number;
    return res;
  };
  res.json = (b) => {
    res.body = b;
    return res;
  };
  let seen: ReturnType<typeof requestContext.getStore> | 'not called' = 'not called';
  const next = () => {
    seen = requestContext.getStore();
  };
  const req = { originalUrl: path, url: path, method: opts.method ?? 'GET', headers: {} };
  return mw.use(req as never, res as never, next).then(() => ({ res, seen, auth }));
}

describe('SessionMiddleware', () => {
  it('lets public paths through without a session', async () => {
    for (const p of [
      '/health',
      '/api/v1/auth-options',
      '/api/v1/invites/abc123',
      '/api/auth/sign-in/username',
    ]) {
      const { res, seen } = await run(p, { method: p.startsWith('/api/auth') ? 'POST' : 'GET' });
      expect(res.statusCode, p).toBe(200);
      expect(seen, p).toBeUndefined();
    }
  });

  it('refuses app API paths without a session (401)', async () => {
    for (const [p, m] of [
      ['/api/data', 'GET'],
      ['/api/weight', 'POST'],
      ['/api/v1/coach/send', 'POST'],
      ['/api/v1/invites', 'GET'],
      ['/api/v1/invites/abc123', 'DELETE'],
    ] as const) {
      const { res, seen } = await run(p, { method: m });
      expect(res.statusCode, `${m} ${p}`).toBe(401);
      expect(seen, p).toBe('not called');
    }
  });

  it('runs the request as the signed-in user, with their profile', async () => {
    const { seen } = await run('/api/data?x=1', {
      session: { user: { id: 'u1' } },
      profile: { userId: 'u1', role: 'admin', timezone: 'Europe/London' },
    });
    expect(seen).toEqual({
      userId: 'u1',
      timeZone: 'Europe/London',
      role: 'admin',
      via: 'session',
    });
  });

  it('treats unknown roles as member', async () => {
    const { seen } = await run('/api/data', {
      session: { user: { id: 'u2' } },
      profile: { userId: 'u2', role: 'owner?', timezone: 'America/Denver' },
    });
    expect(seen).toMatchObject({ userId: 'u2', role: 'member' });
  });
});

describe('CurrentUserService', () => {
  const cu = new CurrentUserService();

  it('is unauthorized outside a signed-in request', () => {
    expect(() => cu.userId()).toThrow(/Sign in/);
  });

  it('reads the request user', () => {
    requestContext.run(
      { userId: 'u1', timeZone: 'Asia/Tokyo', role: 'member', via: 'session' },
      () => {
        expect(cu.userId()).toBe('u1');
        expect(cu.timeZone()).toBe('Asia/Tokyo');
        expect(cu.isAdmin()).toBe(false);
        expect(() => cu.requireAdmin()).toThrow(/Admins only/);
      },
    );
    requestContext.run({ userId: 'a', timeZone: 'UTC', role: 'admin', via: 'session' }, () => {
      expect(() => cu.requireAdmin()).not.toThrow();
    });
  });
});
