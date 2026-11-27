import { contract } from '@heroarc/contracts';
import { and, type DbHandle, desc, eq, isNull, schema } from '@heroarc/db';
import { Controller, Inject, UseGuards } from '@nestjs/common';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { HeroarcClientGuard } from '../common/heroarc-client.guard.js';
import type { Env } from '../infra/env.js';
import { DB, ENV } from '../infra/tokens.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { type AgentKeyRow, AgentKeysService } from './agent-keys.js';

const { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } = schema;

const hostOf = (uris: string[] | null) => {
  try {
    return uris?.[0] ? new URL(uris[0]).host : null;
  } catch {
    return null;
  }
};

const view = (k: AgentKeyRow) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  createdAt: k.createdAt.toISOString(),
  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
});

/** Settings → Connections: the signed-in user's API keys. */
@Controller()
@UseGuards(HeroarcClientGuard)
export class ConnectionsController {
  constructor(
    private readonly keys: AgentKeysService,
    private readonly current: CurrentUserService,
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly dbh: DbHandle,
  ) {}

  /** Apps this user connected by signing in (one row per app). */
  private async apps(userId: string) {
    const rows = await this.dbh.db
      .select({
        clientId: oauthConsent.clientId,
        name: oauthClient.name,
        redirectUris: oauthClient.redirectUris,
        at: oauthConsent.createdAt,
      })
      .from(oauthConsent)
      .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .where(eq(oauthConsent.userId, userId))
      .orderBy(desc(oauthConsent.createdAt));
    const seen = new Set<string>();
    return rows
      .filter((r) => !seen.has(r.clientId) && seen.add(r.clientId))
      .map((r) => ({
        clientId: r.clientId,
        name: (r.name ?? '').trim().slice(0, 60) || 'MCP app',
        host: hostOf(r.redirectUris),
        connectedAt: (r.at ?? new Date()).toISOString(),
      }));
  }

  /** Only the person themselves, in the app (never an agent managing keys). */
  private userId(): string {
    if (this.current.agent()) throw new ORPCError('FORBIDDEN');
    return this.current.userId();
  }

  @Implement(contract.connections.list)
  list() {
    return implement(contract.connections.list).handler(async () => {
      const userId = this.userId();
      return {
        apiUrl: this.env.API_URL.replace(/\/$/, ''),
        keys: (await this.keys.list(userId)).map(view),
        apps: await this.apps(userId),
      };
    });
  }

  @Implement(contract.connections.createKey)
  create() {
    return implement(contract.connections.createKey).handler(async ({ input }) => {
      try {
        const { row, secret } = await this.keys.create(this.userId(), input.name);
        return { key: view(row), secret };
      } catch (e) {
        throw new ORPCError('BAD_REQUEST', { message: (e as Error).message });
      }
    });
  }

  @Implement(contract.connections.disconnectApp)
  disconnect() {
    return implement(contract.connections.disconnectApp).handler(async ({ input }) => {
      const userId = this.userId();
      const mine = (t: typeof oauthConsent | typeof oauthRefreshToken | typeof oauthAccessToken) =>
        and(eq(t.userId, userId), eq(t.clientId, input.clientId));
      await this.dbh.db.transaction(async (tx) => {
        // No consent → its access tokens stop working on /mcp at once (OAuthTokenVerifier).
        await tx.delete(oauthConsent).where(mine(oauthConsent));
        await tx
          .update(oauthRefreshToken)
          .set({ revoked: new Date() })
          .where(and(mine(oauthRefreshToken), isNull(oauthRefreshToken.revoked)));
        await tx.delete(oauthAccessToken).where(mine(oauthAccessToken));
      });
      return { ok: true as const };
    });
  }

  @Implement(contract.connections.revokeKey)
  revoke() {
    return implement(contract.connections.revokeKey).handler(async ({ input }) => {
      await this.keys.revoke(this.userId(), input.id);
      return { ok: true as const };
    });
  }
}
