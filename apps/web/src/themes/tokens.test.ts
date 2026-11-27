import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import TOKENS from './tokens.json';

/*
 * Guardrail for "a theme is one list of CSS variables":
 * - every themes/<id>/vars.css is exactly one [data-theme="<id>"] rule of custom properties,
 *   declaring every token in tokens.json and nothing else;
 * - app styles (features/**.css) never hard-code a colour, font or image:
 *   they only reference tokens (or variables they define themselves).
 */

const SRC = join(import.meta.dirname, '..');
const THEMES_DIR = join(SRC, 'themes');
const FEATURES_DIR = join(SRC, 'features');
const tokenNames = Object.keys(TOKENS);

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Split on `sep` at depth 0, outside quotes and parentheses (data: URIs contain `;`). */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function walk(dir: string, match: (f: string) => boolean): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, match));
    else if (match(p)) out.push(p);
  }
  return out;
}

const themeIds = readdirSync(THEMES_DIR).filter((d) => {
  try {
    return statSync(join(THEMES_DIR, d, 'vars.css')).isFile();
  } catch {
    return false;
  }
});

describe('themes', () => {
  it('every theme folder has a vars.css', () => {
    const folders = readdirSync(THEMES_DIR).filter((d) =>
      statSync(join(THEMES_DIR, d)).isDirectory(),
    );
    expect(folders.length).toBeGreaterThan(0);
    expect(themeIds.sort()).toEqual(folders.sort());
  });
});

describe('tokens.json', () => {
  it('names are kebab-case and every token is documented', () => {
    for (const [name, doc] of Object.entries(TOKENS)) {
      expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      expect(String(doc).length, name).toBeGreaterThan(5);
    }
  });
});

describe.each(themeIds)('themes/%s/vars.css', (id) => {
  const css = stripComments(readFileSync(join(THEMES_DIR, id, 'vars.css'), 'utf8')).trim();
  const m = css.match(/^\[data-theme="([a-z0-9]+)"\]\s*\{([\s\S]*)\}$/);

  it('is a single [data-theme] rule for this theme', () => {
    expect(m, 'expected exactly `[data-theme="<id>"] { --token: value; … }`').not.toBeNull();
    expect(m?.[1]).toBe(id);
  });

  const decls = splitTop(m?.[2] ?? '', ';');

  it('holds only custom-property declarations', () => {
    const bad = decls.filter((d) => !/^--[a-z0-9-]+\s*:\s*\S[\s\S]*$/.test(d));
    expect(bad).toEqual([]);
  });

  it('declares every token exactly once, and nothing else', () => {
    const names = decls.map((d) => d.slice(2, d.indexOf(':')).trim());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, 'declared twice').toEqual([]);
    expect(
      tokenNames.filter((t) => !names.includes(t)),
      'missing tokens',
    ).toEqual([]);
    expect(
      names.filter((n) => !tokenNames.includes(n)),
      'not in tokens.json',
    ).toEqual([]);
  });
});

describe('board styles use tokens only', () => {
  const files = (() => {
    try {
      return walk(FEATURES_DIR, (f) => f.endsWith('.css'));
    } catch {
      return [];
    }
  })();
  const NAMED =
    /(?<![\w-])(white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|gold|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|brown|beige)(?![\w-])/i;

  it.each(files.map((f) => [relative(SRC, f), f]))('%s', (_name, file) => {
    const raw = readFileSync(file, 'utf8');
    const css = stripComments(raw);
    const problems: string[] = [];
    const own = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((x) => x[1]?.slice(2)));
    // Variables set inline by code (e.g. hero piece colours) are declared in a comment:
    // /* @vars c f d: set by heroSvg */
    for (const m of raw.matchAll(/@vars ([a-z0-9 -]+):/g))
      for (const v of (m[1] ?? '').split(/\s+/)) if (v) own.add(v);
    for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
      for (const decl of splitTop(block[1] ?? '', ';')) {
        const i = decl.indexOf(':');
        const prop = decl.slice(0, i).trim();
        const value = decl.slice(i + 1).trim();
        if (/#[0-9a-f]{3,8}\b/i.test(value)) problems.push(`hex colour: ${decl}`);
        if (/(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i.test(value))
          problems.push(`literal colour: ${decl}`);
        if (NAMED.test(value) && !prop.startsWith('--') && prop !== 'grid-template-areas')
          problems.push(`named colour: ${decl}`);
        if (/url\(/i.test(value)) problems.push(`image (use a token): ${decl}`);
        if (/^font(-family)?$/.test(prop) && !/^(var\(|inherit$)/.test(value))
          problems.push(`font (use a token): ${decl}`);
      }
    }
    for (const ref of css.matchAll(/var\(--([a-z0-9-]+)/g)) {
      const name = ref[1] ?? '';
      if (!tokenNames.includes(name) && !own.has(name)) problems.push(`unknown variable --${name}`);
    }
    expect(problems).toEqual([]);
  });
});
