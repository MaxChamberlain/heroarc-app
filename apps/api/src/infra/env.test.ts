import { describe, expect, it } from 'vitest';
import { assertApiEnv, loadEnv } from './env.js';

const base = { DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://x' };

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.version).toBe('dev');
  });

  it('uses the short Render git commit as the version', () => {
    expect(loadEnv({ ...base, RENDER_GIT_COMMIT: 'abcdef1234567' }).version).toBe('abcdef1');
  });

  it('treats an empty BETTER_AUTH_SECRET as unset (dev), but requires one in production', () => {
    expect(loadEnv({ ...base, BETTER_AUTH_SECRET: '' }).BETTER_AUTH_SECRET).toBeUndefined();
    expect(() => loadEnv({ ...base, BETTER_AUTH_SECRET: 'short' })).toThrow(/32 characters/);
    // The API needs it in production; the worker (same env) doesn't.
    const prod = loadEnv({ ...base, NODE_ENV: 'production', BETTER_AUTH_SECRET: '' });
    expect(() => assertApiEnv(prod)).toThrow(/required in production/);
    expect(() => assertApiEnv(loadEnv(base))).not.toThrow();
    const secret = 'x'.repeat(32);
    expect(loadEnv({ ...base, BETTER_AUTH_SECRET: secret }).BETTER_AUTH_SECRET).toBe(secret);
  });

  it('fails fast with a readable message when required vars are missing', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
