import { type DbHandle, eq, schema } from '@heroarc/db';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Redis } from 'ioredis';
import type { Env } from '../infra/env.js';
import { DB, ENV, REDIS } from '../infra/tokens.js';
import { AgentKeysService, KEY_PREFIX, keyFromHeader } from './agent-keys.js';
import { OAuthTokenVerifier } from './oauth-tokens.js';
import { requestContext } from './request-context.js';

const { userProfiles } = schema;

/** The original Hermes API's routes, kept on the API origin (see agent/hermes.controller.ts). */
export const HERMES_PATHS = new Set(['/today', '/food', '/weight', '/training', '/sync']);

/** Paths outside agents call with an API key (never the app's session cookie). */
export const isAgentPath = (path: string) =>
  path.startsWith('/api/agent/') ||
  path === '/mcp' ||
  path.startsWith('/mcp/') ||
  HERMES_PATHS.has(path);

/** Agent paths anyone may read (no key): the OpenAPI document. */
const PUBLIC = new Set(['/api/agent/v1/openapi.json']);

/** Requests per minute per key. */
export const RATE_LIMIT = 120;
/** How long to wait for the rate-limit counter before letting the request through. */
const RATE_LIMIT_WAIT_MS = 250;
const MAX_BODY = 1024 * 1024;

/**
 * Outside agents: `Authorization: Bearer <API key>` on agent paths. Runs the request as the
 * key's owner (CurrentUserService), recorded as `agent:<key name>`. Rate-limited per key.
 * Errors use the original Hermes API's shape: `{ ok: false, error }`.
 */
@Injectable()
export class AgentAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly keys: AgentKeysService,
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly oauth: OAuthTokenVerifier,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const path = (req.originalUrl || req.url).split('?')[0] as string;
    if (!isAgentPath(path) || PUBLIC.has(path)) return next();

    const isMcp = path === '/mcp' || path.startsWith('/mcp/');
    const deny = (status: number, error: string) => {
      if (status === 401)
        res.setHeader(
          'WWW-Authenticate',
          // MCP clients that sign in (OAuth) start from the protected resource metadata.
          isMcp
            ? `Bearer realm="HeroArc", resource_metadata="${this.env.API_URL.replace(/\/$/, '')}/.well-known/oauth-protected-resource/mcp"`
            : 'Bearer realm="HeroArc"',
        );
      res.status(status).json({ ok: false, error });
    };
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return deny(413, 'body too large');

    const secret = keyFromHeader(req.headers.authorization);
    if (!secret)
      return deny(
        401,
        'unauthorized: no Authorization header received. Send "Authorization: Bearer <HeroArc API key>" (create one in HeroArc → Settings → Connections).',
      );
    // An API key anywhere agents go; an OAuth access token (bound to the MCP resource) on /mcp.
    const key = secret.startsWith(KEY_PREFIX)
      ? await this.keys.verify(secret)
      : isMcp
        ? await this.oauth.verify(secret).then(
            (t) =>
              t && {
                id: `oauth:${t.clientId}`,
                userId: t.userId,
                name: t.clientName,
                oauth: true,
              },
          )
        : undefined;
    if (!key)
      return deny(
        401,
        "unauthorized: that key or token isn't valid (it may have been revoked or expired). Create a key in HeroArc → Settings → Connections.",
      );

    // Fails open if Valkey is down or slow (the shared connection retries forever, for BullMQ):
    // better a missed limit than a hung agent.
    const bucket = `rl:agent:${key.id}:${key.userId}:${Math.floor(Date.now() / 60_000)}`;
    const used = await Promise.race([
      this.redis
        .multi()
        .incr(bucket)
        .expire(bucket, 70)
        .exec()
        .then((r) => Number(r?.[0]?.[1] ?? 0))
        .catch(() => 0),
      new Promise<number>((done) => setTimeout(() => done(0), RATE_LIMIT_WAIT_MS).unref()),
    ]);
    if (used > RATE_LIMIT) {
      res.setHeader('Retry-After', String(60 - (Math.floor(Date.now() / 1000) % 60)));
      return deny(429, `rate limit: at most ${RATE_LIMIT} requests a minute per key`);
    }

    const [p] = await this.dbh.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, key.userId));
    if (!('oauth' in key)) void this.keys.touch(key.id).catch(() => {});
    requestContext.run(
      {
        userId: key.userId,
        timeZone: p?.timezone ?? 'America/Denver',
        role: p?.role === 'admin' ? 'admin' : 'member',
        via: 'agent',
        connectionId: key.id,
        actor: `agent:${key.name}`,
      },
      () => next(),
    );
  }
}
