import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Oura's API terms don't allow Oura API data to be used as input to AI models (§4(d)) or passed
 * to other products' AI (§2(c)). Everything an assistant or outside agent can read comes from the
 * code under these folders, so none of it may touch daily_metrics (the Oura table).
 */
const AI_PATHS = ['agent', 'coach'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory()
      ? files(p)
      : p.endsWith('.ts') && !p.endsWith('.test.ts')
        ? [p]
        : [];
  });
}

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('wearable (Oura) data stays out of AI paths', () => {
  for (const area of AI_PATHS)
    for (const f of files(join(import.meta.dirname, '..', area)))
      it(`${area}/${f.split(`${area}/`)[1]} never reads daily_metrics`, () => {
        const src = code(readFileSync(f, 'utf8'));
        expect(src).not.toMatch(/dailyMetrics|daily_metrics/);
        expect(src).not.toMatch(/buildSnapshot|snapshot\(/);
      });
});
