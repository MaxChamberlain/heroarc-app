import { createHash, randomBytes } from 'node:crypto';
import type { OuraStatus } from '@heroarc/contracts';
import { and, type DbHandle, eq, ne, schema, sql } from '@heroarc/db';
import {
  localDate,
  OURA_COLLECTIONS,
  type OuraCollections,
  type OuraDay,
  ouraDays,
  shiftDate,
} from '@heroarc/domain';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import type { Redis } from 'ioredis';
import { authSecret, type Env } from '../infra/env.js';
import { DB, ENV, REDIS } from '../infra/tokens.js';
import {
  OURA_SCOPES,
  type OuraApi,
  OuraAuthError,
  OuraRateLimitError,
  OuraScopeError,
} from './oura-api.js';

const { dailyMetrics, ouraConnections, userProfiles } = schema;

export const OURA_API = Symbol('OURA_API');

/** How far back the first sync reaches. */
export const BACKFILL_DAYS = 730;
/** Recent days each later sync refreshes (Oura revises the last few days). */
const RECENT_DAYS = 3;
const WINDOW_DAYS = 90;
const STATE_TTL_SECONDS = 600;

/** Not connected (or HeroArc has no Oura application). */
export class OuraNotConnected extends Error {}

type ReturnTo = 'settings' | 'onboarding';
const scopeOf = (c: keyof OuraCollections) => (c === 'daily_stress' ? 'stress' : 'daily');
const b64url = (b: Buffer) => b.toString('base64url');

/**
 * Oura for one HeroArc account: connect (OAuth with PKCE), sync the daily numbers into
 * daily_metrics (source 'oura'), and disconnect (which deletes them). Tokens are stored
 * encrypted; Oura's refresh tokens are single-use, so refreshing happens under a row lock.
 * Oura data is for the dashboard only: Coach and agents never read it.
 */
@Injectable()
export class OuraService {
  private readonly log = new Logger('Oura');

  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(OURA_API) private readonly api: OuraApi | null,
  ) {}

  private get db() {
    return this.dbh.db;
  }

  get available(): boolean {
    return !!this.api;
  }

  private requireApi(): OuraApi {
    if (!this.api) throw new OuraNotConnected('Oura is not set up on this server.');
    return this.api;
  }

  redirectUri(): string {
    return `${this.env.APP_URL.replace(/\/$/, '')}/api/v1/oura/callback`;
  }

  private enc(s: string) {
    return symmetricEncrypt({ key: authSecret(this.env), data: s });
  }

  private dec(s: string) {
    return symmetricDecrypt({ key: authSecret(this.env), data: s });
  }

  async status(userId: string): Promise<OuraStatus> {
    const [c] = await this.db
      .select()
      .from(ouraConnections)
      .where(eq(ouraConnections.userId, userId));
    return {
      available: this.available,
      connected: !!c,
      status: c ? (c.status as OuraStatus['status']) : null,
      lastSyncAt: c?.lastSyncAt?.toISOString() ?? null,
      syncedFrom: c?.syncedFrom ?? null,
      missingScopes: c?.scopes.length ? OURA_SCOPES.filter((s) => !c.scopes.includes(s)) : [],
    };
  }

  /** Oura's consent page for this user; the state (with the PKCE verifier) waits in Valkey. */
  async connectUrl(userId: string, returnTo: ReturnTo): Promise<string> {
    const api = this.requireApi();
    const state = b64url(randomBytes(24));
    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    await this.redis.set(
      `oura:state:${state}`,
      JSON.stringify({ userId, verifier, returnTo }),
      'EX',
      STATE_TTL_SECONDS,
    );
    return api.authorizeUrl({ state, challenge, redirectUri: this.redirectUri() });
  }

  /** Where the user started (for the redirect back), if the state is theirs and still valid. */
  async stateReturnTo(state: string): Promise<ReturnTo | null> {
    const raw = await this.redis.get(`oura:state:${state}`);
    return raw ? ((JSON.parse(raw) as { returnTo: ReturnTo }).returnTo ?? 'settings') : null;
  }

  /** Oura sent the user back with a code: store the connection. Returns where to send them. */
  async finishConnect(userId: string, code: string, state: string): Promise<ReturnTo> {
    const api = this.requireApi();
    const raw = await this.redis.getdel(`oura:state:${state}`);
    if (!raw) throw new OuraAuthError('That connection attempt expired. Try again.');
    const s = JSON.parse(raw) as { userId: string; verifier: string; returnTo: ReturnTo };
    if (s.userId !== userId)
      throw new OuraAuthError('That connection was started by someone else.');
    const t = await api.exchange({ code, verifier: s.verifier, redirectUri: this.redirectUri() });
    const values = {
      accessToken: await this.enc(t.accessToken),
      refreshToken: await this.enc(t.refreshToken),
      expiresAt: new Date(Date.now() + t.expiresIn * 1000),
      scopes: t.scopes ?? [...OURA_SCOPES],
      status: 'ok',
      lastError: null,
    };
    await this.db
      .insert(ouraConnections)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: ouraConnections.userId,
        set: { ...values, connectedAt: new Date() },
      });
    return s.returnTo;
  }

  /** A valid access token, refreshing it first if it's about to expire (one refresh at a time). */
  private async accessToken(userId: string): Promise<string> {
    const api = this.requireApi();
    return this.db.transaction(async (tx) => {
      const [c] = await tx
        .select()
        .from(ouraConnections)
        .where(eq(ouraConnections.userId, userId))
        .for('update');
      if (!c) throw new OuraNotConnected();
      if (c.expiresAt.getTime() > Date.now() + 120_000) return this.dec(c.accessToken);
      const t = await api.refresh(await this.dec(c.refreshToken));
      await tx
        .update(ouraConnections)
        .set({
          accessToken: await this.enc(t.accessToken),
          refreshToken: await this.enc(t.refreshToken),
          expiresAt: new Date(Date.now() + t.expiresIn * 1000),
          ...(t.scopes && { scopes: t.scopes }),
        })
        .where(eq(ouraConnections.userId, userId));
      return t.accessToken;
    });
  }

  /**
   * Fetch from Oura and store. The first sync backfills BACKFILL_DAYS; later ones refresh the
   * last few days (or `days`). Records the outcome on the connection; failures are rethrown.
   */
  async sync(userId: string, opts: { days?: number } = {}): Promise<{ days: number }> {
    const api = this.requireApi();
    const [c] = await this.db
      .select()
      .from(ouraConnections)
      .where(eq(ouraConnections.userId, userId));
    if (!c) throw new OuraNotConnected();
    const [p] = await this.db
      .select({ tz: userProfiles.timezone })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    const today = localDate(new Date(), p?.tz ?? 'America/Denver');
    const back = c.syncedFrom
      ? Math.max(1, Math.min(opts.days ?? RECENT_DAYS, BACKFILL_DAYS))
      : BACKFILL_DAYS;
    const start = shiftDate(today, -back);
    const end = shiftDate(today, 1);

    try {
      const token = await this.accessToken(userId);
      const got: Partial<OuraCollections> = {};
      const denied = new Set<string>();
      for (let from = start; from <= end; from = shiftDate(from, WINDOW_DAYS + 1)) {
        const to = [shiftDate(from, WINDOW_DAYS), end].sort()[0] as string;
        for (const name of OURA_COLLECTIONS) {
          if (denied.has(scopeOf(name))) continue;
          try {
            const rows = await api.collection(token, name, from, to);
            (got[name] as unknown[] | undefined) = [...((got[name] as unknown[]) ?? []), ...rows];
          } catch (e) {
            // The user unticked this on Oura's consent screen: sync the rest.
            if (e instanceof OuraScopeError) denied.add(scopeOf(name));
            else throw e;
          }
        }
      }
      // Asking up to tomorrow completes today; nothing later is kept.
      const days = ouraDays(got).filter((d) => d.date <= today);
      await this.store(userId, days);
      await this.db
        .update(ouraConnections)
        .set({
          lastSyncAt: new Date(),
          status: 'ok',
          lastError: null,
          syncedFrom: c.syncedFrom && c.syncedFrom < start ? c.syncedFrom : start,
          ...(denied.size && { scopes: c.scopes.filter((s) => !denied.has(s)) }),
        })
        .where(eq(ouraConnections.userId, userId));
      return { days: days.length };
    } catch (e) {
      const reconnect = e instanceof OuraAuthError;
      await this.db
        .update(ouraConnections)
        .set({
          status: reconnect ? 'reconnect' : 'error',
          lastError:
            e instanceof OuraRateLimitError
              ? 'Oura is busy; HeroArc will try again shortly.'
              : String((e as Error).message).slice(0, 300),
        })
        .where(eq(ouraConnections.userId, userId));
      throw e;
    }
  }

  private async store(userId: string, days: OuraDay[]) {
    const ex = (col: string) => sql.raw(`excluded.${col}`);
    for (let i = 0; i < days.length; i += 300) {
      await this.db
        .insert(dailyMetrics)
        .values(days.slice(i, i + 300).map((d) => ({ userId, ...d, source: 'oura' })))
        .onConflictDoUpdate({
          target: [dailyMetrics.userId, dailyMetrics.date],
          set: {
            sleepScore: ex('sleep_score'),
            readiness: ex('readiness'),
            sleepHours: ex('sleep_hours'),
            hrv: ex('hrv'),
            rhr: ex('rhr'),
            bedMin: ex('bed_min'),
            wakeMin: ex('wake_min'),
            stressMin: ex('stress_min'),
            recoveryMin: ex('recovery_min'),
            stressSummary: ex('stress_summary'),
            steps: ex('steps'),
            activeKcal: ex('active_kcal'),
            totalKcal: ex('total_kcal'),
            source: 'oura',
            updatedAt: new Date(),
          },
        });
    }
  }

  /** The scheduled sync: every connection that still works, one at a time. */
  async syncAll(): Promise<{ ok: number; failed: number }> {
    if (!this.api) return { ok: 0, failed: 0 };
    const rows = await this.db
      .select({ userId: ouraConnections.userId })
      .from(ouraConnections)
      .where(ne(ouraConnections.status, 'reconnect'));
    let ok = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        await this.sync(r.userId);
        ok++;
      } catch (e) {
        failed++;
        this.log.warn(`sync failed for a user: ${(e as Error).message}`);
        if (e instanceof OuraRateLimitError) break;
      }
    }
    return { ok, failed };
  }

  /** Disconnect: tell Oura (best effort), forget the tokens, delete the Oura data stored. */
  async disconnect(userId: string): Promise<void> {
    const [c] = await this.db
      .select()
      .from(ouraConnections)
      .where(eq(ouraConnections.userId, userId));
    if (c && this.api) {
      const token = await this.dec(c.accessToken).catch(() => null);
      if (token) await this.api.revoke(token).catch(() => {});
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(ouraConnections).where(eq(ouraConnections.userId, userId));
      await tx
        .delete(dailyMetrics)
        .where(and(eq(dailyMetrics.userId, userId), eq(dailyMetrics.source, 'oura')));
    });
  }
}
