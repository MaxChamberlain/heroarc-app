import { type DbHandle, eq, schema } from '@heroarc/db';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { DB } from '../infra/tokens.js';
import { isAgentPath } from './agent-auth.middleware.js';
import type { Auth } from './auth.js';
import { requestContext } from './request-context.js';
import { AUTH } from './tokens.js';

const { userProfiles } = schema;

/** Paths anyone may call without signing in. */
const PUBLIC = [
  /^\/health$/,
  /^\/api\/v1\/system\/health$/, // for uptime checks: status only, nothing personal
  /^\/api\/auth\//,
  /^\/api\/v1\/auth-options$/,
  /^\/api\/v1\/invites\/[^/]+$/, // GET only (checked below)
];

/**
 * Resolves the signed-in user from the session cookie and runs the request as them
 * (CurrentUserService reads it). App API paths without a session get 401.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB) private readonly dbh: DbHandle,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // originalUrl: Express rewrites req.path relative to where middleware is mounted.
    const path = (req.originalUrl || req.url).split('?')[0] as string;
    const isPublic =
      PUBLIC.some((p) => p.test(path)) && (req.method === 'GET' || /^\/api\/auth\//.test(path));
    // Agent paths use API keys instead (AgentAuthMiddleware).
    if (isPublic || isAgentPath(path) || !path.startsWith('/api/')) return next();
    const s = await this.auth.api
      .getSession({ headers: fromNodeHeaders(req.headers) })
      .catch(() => null);
    if (!s) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Sign in to continue.' });
      return;
    }
    let [p] = await this.dbh.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, s.user.id));
    if (!p) {
      [p] = await this.dbh.db
        .insert(userProfiles)
        .values({ userId: s.user.id })
        .onConflictDoNothing()
        .returning();
      p ??= (
        await this.dbh.db.select().from(userProfiles).where(eq(userProfiles.userId, s.user.id))
      )[0];
    }
    requestContext.run(
      {
        userId: s.user.id,
        timeZone: p?.timezone ?? 'America/Denver',
        role: p?.role === 'admin' ? 'admin' : 'member',
        via: 'session',
      },
      () => next(),
    );
  }
}
