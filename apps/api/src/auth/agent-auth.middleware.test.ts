import { describe, expect, it, vi } from 'vitest';
import { AgentAuthMiddleware, isAgentPath, RATE_LIMIT } from './agent-auth.middleware.js';
import { hashAgentKey, KEY_PREFIX, keyFromHeader, newAgentKey } from './agent-keys.js';
import { requestContext } from './request-context.js';

describe('API keys', () => {
  it('look like hak_…, are random, and only their hash is kept', () => {
    const a = newAgentKey();
    const b = newAgentKey();
    expect(a.secret.startsWith(KEY_PREFIX)).toBe(true);
    expect(a.secret.length).toBeGreaterThan(40);
    expect(a.secret).not.toBe(b.secret);
    expect(a.prefix).toBe(a.secret.slice(0, 10));
    expect(a.hash).toBe(hashAgentKey(a.secret));
    expect(a.hash).not.toContain(a.secret.slice(4));
  });

  it('are read from "Bearer <key>" in any case, or a bare key', () => {
    expect(keyFromHeader('Bearer hak_x')).toBe('hak_x');
    expect(keyFromHeader('bearer   hak_x ')).toBe('hak_x');
    expect(keyFromHeader('hak_x')).toBe('hak_x');
    expect(keyFromHeader(undefined)).toBe('');
  });
});

describe('isAgentPath', () => {
  it('covers the agent API, MCP and the original Hermes routes only', () => {
    for (const p of [
      '/api/agent/v1/tools',
      '/mcp',
      '/today',
      '/food',
      '/weight',
      '/training',
      '/sync',
    ])
      expect(isAgentPath(p), p).toBe(true);
    for (const p of ['/api/data', '/api/weight', '/api/v1/me', '/health', '/todays', '/mcpx'])
      expect(isAgentPath(p), p).toBe(false);
  });
});

type Fn = (...a: unknown[]) => unknown;

function setup(opts: { key?: { id: string; userId: string; name: string }; used?: number }) {
  const keys = {
    verify: vi.fn(async (s: string) => (s === 'hak_good' ? opts.key : undefined)),
    touch: vi.fn(async () => {}),
  };
  const chain = {
    from: () => chain,
    where: async () => [{ timezone: 'Europe/Paris', role: 'member' }],
  };
  const db = { db: { select: () => chain } };
  const redis = {
    multi: () => ({
      incr: () => ({
        expire: () => ({
          // used: -1 → a connection that never answers.
          exec: () =>
            opts.used === -1 ? new Promise(() => {}) : Promise.resolve([[null, opts.used ?? 1]]),
        }),
      }),
    }),
  };
  // OAuth: "eyJ.good.sig" is a valid access token for user u2 from the app "Claude".
  const oauth = {
    verify: vi.fn(async (t: string) =>
      t === 'eyJ.good.sig'
        ? { userId: 'u2', clientId: 'c1', clientName: 'Claude', scopes: ['openid'] }
        : undefined,
    ),
  };
  const env = { API_URL: 'https://api.example.com' };
  const mw = new AgentAuthMiddleware(
    keys as never,
    db as never,
    redis as never,
    oauth as never,
    env as never,
  );
  return async (path: string, auth?: string) => {
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      headers: {} as Record<string, string>,
    } as {
      statusCode: number;
      body: unknown;
      headers: Record<string, string>;
      status: Fn;
      json: Fn;
      setHeader: Fn;
    };
    res.status = (c) => {
      res.statusCode = c as number;
      return res;
    };
    res.json = (b) => {
      res.body = b;
      return res;
    };
    res.setHeader = (k, v) => {
      res.headers[k as string] = v as string;
    };
    let seen: unknown = 'not called';
    const req = {
      originalUrl: path,
      url: path,
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
    };
    await mw.use(req as never, res as never, () => {
      seen = requestContext.getStore();
    });
    return { res, seen, keys, oauth };
  };
}

describe('AgentAuthMiddleware', () => {
  const key = { id: 'k1', userId: 'u1', name: 'Hermes' };

  it('ignores app paths (sessions handle those)', async () => {
    const { seen } = await setup({ key })('/api/data');
    expect(seen).toBeUndefined();
  });

  it('lets the OpenAPI document through without a key', async () => {
    const { res, seen } = await setup({ key })('/api/agent/v1/openapi.json');
    expect(res.statusCode).toBe(200);
    expect(seen).toBeUndefined();
  });

  it('401s without a key, or with a bad / revoked one, saying what to do', async () => {
    const run = setup({ key });
    const none = await run('/api/agent/v1/tools');
    expect(none.res.statusCode).toBe(401);
    expect(none.res.headers['WWW-Authenticate']).toContain('Bearer');
    expect((none.res.body as { error: string }).error).toContain('no Authorization header');
    const bad = await run('/weight', 'Bearer hak_bad');
    expect(bad.res.statusCode).toBe(401);
    expect((bad.res.body as { ok: boolean }).ok).toBe(false);
    expect(bad.seen).toBe('not called');
  });

  it("runs the request as the key's owner, recorded as agent:<name>", async () => {
    const { seen, keys } = await setup({ key })(
      '/api/agent/v1/tools/log_weight',
      'Bearer hak_good',
    );
    expect(seen).toEqual({
      userId: 'u1',
      timeZone: 'Europe/Paris',
      role: 'member',
      via: 'agent',
      connectionId: 'k1',
      actor: 'agent:Hermes',
    });
    expect(keys.touch).toHaveBeenCalledWith('k1');
  });

  it('lets requests through if Valkey hangs (fails open, quickly)', async () => {
    const run = setup({ key, used: -1 });
    const t = Date.now();
    const { seen } = await run('/today', 'hak_good');
    expect(seen).toMatchObject({ userId: 'u1' });
    expect(Date.now() - t).toBeLessThan(1500);
  });

  it('takes OAuth access tokens on /mcp only, as the app the user connected', async () => {
    const run = setup({ key });
    const ok = await run('/mcp', 'Bearer eyJ.good.sig');
    expect(ok.seen).toMatchObject({
      userId: 'u2',
      via: 'agent',
      connectionId: 'oauth:c1',
      actor: 'agent:Claude',
    });
    expect(ok.keys.touch).not.toHaveBeenCalled();
    // Bound to the MCP resource: no good on the REST API or the Hermes routes.
    for (const p of ['/api/agent/v1/tools', '/today']) {
      const r = await run(p, 'Bearer eyJ.good.sig');
      expect(r.res.statusCode, p).toBe(401);
    }
  });

  it('points MCP clients at the OAuth metadata when they have no token', async () => {
    const { res } = await setup({ key })('/mcp');
    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toContain(
      'resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp"',
    );
    const bad = await setup({ key })('/mcp', 'Bearer eyJ.bad.sig');
    expect(bad.res.statusCode).toBe(401);
  });

  it(`allows ${RATE_LIMIT} requests a minute per key, then 429`, async () => {
    const ok = await setup({ key, used: RATE_LIMIT })('/today', 'hak_good');
    expect(ok.res.statusCode).toBe(200);
    const over = await setup({ key, used: RATE_LIMIT + 1 })('/today', 'hak_good');
    expect(over.res.statusCode).toBe(429);
    expect(over.res.headers['Retry-After']).toBeTruthy();
    expect(over.seen).toBe('not called');
  });
});
