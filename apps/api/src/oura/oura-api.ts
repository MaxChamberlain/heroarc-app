import type { OuraCollections } from '@heroarc/domain';

/** Oura's sign-in and data API, as HeroArc uses it (HTTP for real; a scripted fake in tests). */
export interface OuraApi {
  /** Oura's consent page for this request. */
  authorizeUrl(p: { state: string; challenge: string; redirectUri: string }): string;
  exchange(p: { code: string; verifier: string; redirectUri: string }): Promise<OuraTokens>;
  refresh(refreshToken: string): Promise<OuraTokens>;
  revoke(accessToken: string): Promise<void>;
  /** All of one collection for days start..end (YYYY-MM-DD), following pages. */
  collection<K extends keyof OuraCollections>(
    accessToken: string,
    name: K,
    start: string,
    end: string,
  ): Promise<OuraCollections[K]>;
}

export interface OuraTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds. */
  expiresIn: number;
  /** Granted scopes, when Oura says. */
  scopes: string[] | null;
}

/** What HeroArc asks for: daily summaries (sleep, readiness, activity) and stress. */
export const OURA_SCOPES = ['daily', 'stress'] as const;

/** Oura refused the token or grant: the user has to connect again. */
export class OuraAuthError extends Error {}
/** A collection needs a scope the user didn't grant. */
export class OuraScopeError extends Error {}
/** Too many requests (Oura allows 5000 per 5 minutes per app). */
export class OuraRateLimitError extends Error {}

const AUTHORIZE = 'https://cloud.ouraring.com/oauth/authorize';
const TOKEN = 'https://api.ouraring.com/oauth/token';
const REVOKE = 'https://api.ouraring.com/oauth/revoke';
const DATA = 'https://api.ouraring.com/v2/usercollection';
const UA = 'HeroArc/1.0 (+https://app.heroarc.io)';

export class HttpOuraApi implements OuraApi {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  authorizeUrl(p: { state: string; challenge: string; redirectUri: string }): string {
    const u = new URL(AUTHORIZE);
    u.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: p.redirectUri,
      scope: OURA_SCOPES.join(' '),
      state: p.state,
      code_challenge: p.challenge,
      code_challenge_method: 'S256',
    }).toString();
    return u.toString();
  }

  private async token(body: Record<string, string>): Promise<OuraTokens> {
    const r = await this.fetchFn(TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
      body: new URLSearchParams({
        ...body,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || typeof j.access_token !== 'string' || typeof j.refresh_token !== 'string') {
      const why = String(j.error_description ?? j.error ?? j.detail ?? r.status);
      if (r.status === 400 || r.status === 401) throw new OuraAuthError(why);
      throw new Error(`Oura token request failed: ${why}`);
    }
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresIn: typeof j.expires_in === 'number' ? j.expires_in : 86_400,
      scopes: typeof j.scope === 'string' ? j.scope.split(/\s+/).filter(Boolean) : null,
    };
  }

  exchange(p: { code: string; verifier: string; redirectUri: string }) {
    return this.token({
      grant_type: 'authorization_code',
      code: p.code,
      redirect_uri: p.redirectUri,
      code_verifier: p.verifier,
    });
  }

  refresh(refreshToken: string) {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async revoke(accessToken: string): Promise<void> {
    const u = new URL(REVOKE);
    u.searchParams.set('access_token', accessToken);
    await this.fetchFn(u, { headers: { 'user-agent': UA } }).catch(() => {});
  }

  async collection<K extends keyof OuraCollections>(
    accessToken: string,
    name: K,
    start: string,
    end: string,
  ): Promise<OuraCollections[K]> {
    const out: unknown[] = [];
    let next: string | undefined;
    for (let page = 0; page < 50; page++) {
      const u = new URL(`${DATA}/${name}`);
      u.searchParams.set('start_date', start);
      u.searchParams.set('end_date', end);
      if (next) u.searchParams.set('next_token', next);
      const r = await this.fetchFn(u, {
        headers: { authorization: `Bearer ${accessToken}`, 'user-agent': UA },
      });
      if (r.status === 429) throw new OuraRateLimitError('Oura rate limit');
      const j = (await r.json().catch(() => ({}))) as {
        data?: unknown[];
        next_token?: string;
        detail?: string;
      };
      if (r.status === 401 || r.status === 403) {
        if (/scope/i.test(j.detail ?? '')) throw new OuraScopeError(name);
        throw new OuraAuthError(j.detail ?? `Oura refused the token (${r.status})`);
      }
      if (!r.ok) throw new Error(`Oura ${name} failed (${r.status})`);
      out.push(...(j.data ?? []));
      next = j.next_token ?? undefined;
      if (!next) break;
    }
    return out as OuraCollections[K];
  }
}
