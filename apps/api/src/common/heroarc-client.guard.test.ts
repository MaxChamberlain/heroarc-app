import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { HeroarcClientGuard, MaxBody } from './heroarc-client.guard.js';

function ctx(
  req: { method: string; headers: Record<string, string> },
  handler: () => void = () => {},
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

const guard = new HeroarcClientGuard();

describe('HeroarcClientGuard', () => {
  it('lets reads through', () => {
    expect(guard.canActivate(ctx({ method: 'GET', headers: {} }))).toBe(true);
  });

  it('requires x-heroarc: 1 on writes', () => {
    expect(() => guard.canActivate(ctx({ method: 'POST', headers: {} }))).toThrow(/Forbidden/);
    expect(guard.canActivate(ctx({ method: 'POST', headers: { 'x-heroarc': '1' } }))).toBe(true);
  });

  it('rejects a foreign Origin, accepts our own (direct or via the web proxy)', () => {
    const post = (headers: Record<string, string>) =>
      guard.canActivate(ctx({ method: 'POST', headers: { 'x-heroarc': '1', ...headers } }));
    expect(() => post({ origin: 'https://evil.example', host: 'api.heroarc.app' })).toThrow();
    expect(post({ origin: 'https://api.heroarc.app', host: 'api.heroarc.app' })).toBe(true);
    expect(
      post({
        origin: 'https://app.heroarc.app',
        host: 'heroarc-api:10000',
        'x-forwarded-host': 'app.heroarc.app',
      }),
    ).toBe(true);
  });

  it('rejects large bodies', () => {
    expect(() =>
      guard.canActivate(
        ctx({ method: 'POST', headers: { 'x-heroarc': '1', 'content-length': '100000' } }),
      ),
    ).toThrow(/Too Large/);
  });

  it('lets a route that takes files declare a bigger limit', () => {
    const withLimits = new HeroarcClientGuard(new Reflector());
    const upload = () => {};
    MaxBody(1024 * 1024)(upload, 'upload', { value: upload });
    const post = (bytes: number, handler?: () => void) =>
      withLimits.canActivate(
        ctx(
          { method: 'POST', headers: { 'x-heroarc': '1', 'content-length': String(bytes) } },
          handler,
        ),
      );
    expect(() => post(120_000)).toThrow(/Too Large/);
    expect(post(120_000, upload)).toBe(true);
    expect(() => post(2 * 1024 * 1024, upload)).toThrow(/Too Large/);
  });
});
