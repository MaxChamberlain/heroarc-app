import { and, type DbHandle, eq, schema } from '@heroarc/db';
import { Inject, Injectable } from '@nestjs/common';
import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';
import type { Env } from '../infra/env.js';
import { DB, ENV } from '../infra/tokens.js';
import { type Auth, mcpResource } from './auth.js';
import { AUTH } from './tokens.js';

const { oauthClient, oauthConsent } = schema;
const KEYS_TTL_MS = 5 * 60_000;

/** Who an OAuth access token speaks for: the user, and the app they connected. */
export interface OAuthPrincipal {
  userId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
}

/**
 * Checks OAuth access tokens that MCP clients (Claude, ChatGPT…) send to /mcp: signed by our
 * keys (read in-process), issued by our authorization server, for the MCP resource, typed as an
 * access token (`at+jwt`, never a session JWT), naming a client (`azp`), not expired, and from
 * an app the user hasn't disconnected.
 */
@Injectable()
export class OAuthTokenVerifier {
  private keys?: { set: ReturnType<typeof createLocalJWKSet>; at: number };
  private issuer?: string;
  private readonly names = new Map<string, string>();

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly dbh: DbHandle,
  ) {}

  private async keySet(fresh = false) {
    if (!fresh && this.keys && Date.now() - this.keys.at < KEYS_TTL_MS) return this.keys.set;
    const jwks = (await this.auth.api.getJwks()) as unknown as JSONWebKeySet;
    this.keys = { set: createLocalJWKSet(jwks), at: Date.now() };
    return this.keys.set;
  }

  private async issuerUrl(): Promise<string> {
    this.issuer ??= ((await this.auth.api.getOAuthServerConfig()) as { issuer: string }).issuer;
    return this.issuer;
  }

  private async clientName(clientId: string): Promise<string> {
    const known = this.names.get(clientId);
    if (known) return known;
    const [c] = await this.dbh.db
      .select({ name: oauthClient.name })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId));
    const name = (c?.name ?? '').trim().slice(0, 40) || 'MCP app';
    this.names.set(clientId, name);
    return name;
  }

  /** The principal, or undefined for anything that isn't a valid access token for /mcp. */
  async verify(token: string): Promise<OAuthPrincipal | undefined> {
    if (token.split('.').length !== 3) return undefined;
    const opts = {
      issuer: await this.issuerUrl(),
      audience: mcpResource(this.env),
      typ: 'at+jwt',
      requiredClaims: ['sub', 'azp', 'exp'],
    };
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, await this.keySet(), opts));
    } catch (e) {
      // Keys may have rotated since we read them: retry once with fresh keys.
      if ((e as { code?: string }).code !== 'ERR_JWKS_NO_MATCHING_KEY') return undefined;
      try {
        ({ payload } = await jwtVerify(token, await this.keySet(true), opts));
      } catch {
        return undefined;
      }
    }
    const clientId = String(payload.azp);
    const userId = String(payload.sub);
    // Disconnecting the app in Settings deletes the consent: its tokens stop working at once.
    const [consent] = await this.dbh.db
      .select({ id: oauthConsent.id })
      .from(oauthConsent)
      .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
      .limit(1);
    if (!consent) return undefined;
    return {
      userId,
      clientId,
      clientName: await this.clientName(clientId),
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [],
    };
  }
}
