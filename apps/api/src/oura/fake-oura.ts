import type { OuraCollections } from '@heroarc/domain';
import { type OuraApi, OuraAuthError, type OuraTokens } from './oura-api.js';

/**
 * A scripted Oura for tests and local development (OURA_CLIENT_ID=fake): its "consent page" is
 * /api/v1/oura/fake-authorize, which approves at once, and its data is made up from the date.
 * It never calls Oura.
 */
export class FakeOuraApi implements OuraApi {
  private n = 0;
  constructor(private readonly appUrl: string) {}

  authorizeUrl(p: { state: string; challenge: string; redirectUri: string }): string {
    const u = new URL('/api/v1/oura/fake-authorize', this.appUrl);
    u.search = new URLSearchParams({ state: p.state, redirect_uri: p.redirectUri }).toString();
    return u.toString();
  }

  private tokens(): OuraTokens {
    this.n++;
    return {
      accessToken: `fake-access-${this.n}`,
      refreshToken: `fake-refresh-${this.n}`,
      expiresIn: 86_400,
      scopes: ['daily', 'stress'],
    };
  }

  async exchange(p: { code: string }): Promise<OuraTokens> {
    if (p.code !== 'fake-code') throw new OuraAuthError('invalid_grant');
    return this.tokens();
  }

  async refresh(): Promise<OuraTokens> {
    return this.tokens();
  }

  async revoke(): Promise<void> {}

  async collection<K extends keyof OuraCollections>(
    _token: string,
    name: K,
    start: string,
    end: string,
  ): Promise<OuraCollections[K]> {
    const days: string[] = [];
    for (
      let d = new Date(`${start}T12:00:00Z`);
      d <= new Date(`${end}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1)
    )
      days.push(d.toISOString().slice(0, 10));
    // A steady pattern from the date, so tests can predict it.
    const v = (day: string, lo: number, hi: number) => {
      let h = 0;
      for (const c of `${name}${day}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return lo + (h % (hi - lo + 1));
    };
    const rows = days.map((day) => {
      switch (name) {
        case 'daily_sleep':
          return { day, score: v(day, 60, 95) };
        case 'daily_readiness':
          return { day, score: v(day, 55, 98) };
        case 'daily_activity':
          return {
            day,
            steps: v(day, 2000, 14000),
            active_calories: v(day, 150, 800),
            total_calories: v(day, 1900, 2900),
          };
        case 'sleep':
          return {
            day,
            type: 'long_sleep',
            total_sleep_duration: v(day, 21_600, 30_600),
            average_hrv: v(day, 35, 90),
            lowest_heart_rate: v(day, 44, 62),
            bedtime_start: `${day}T22:${String(v(day, 10, 59)).padStart(2, '0')}:00-07:00`,
            bedtime_end: `${day}T06:${String(v(day, 10, 59)).padStart(2, '0')}:00-07:00`,
          };
        default:
          return {
            day,
            stress_high: v(day, 0, 7200),
            recovery_high: v(day, 0, 7200),
            day_summary: 'normal',
          };
      }
    });
    return rows as OuraCollections[K];
  }
}
