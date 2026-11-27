import { alchemist } from './alchemist';
import { beige84 } from './beige84';
import { colorarchive } from './colorarchive';
import { cyberpunk } from './cyberpunk';
import { greekgod } from './greekgod';
import { night } from './night';
import { simple } from './simple';
import { streetfighter } from './streetfighter';
import type { ThemeDefinition, ThemeId } from './types';

/** Settings lists the themes in this order: the plain one first, then the gamified ones. */
export const THEME_ORDER: readonly ThemeId[] = [
  'simple',
  'night',
  'alchemist',
  'streetfighter',
  'cyberpunk',
  'greekgod',
  'beige84',
  'colorarchive',
];

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  simple: simple,
  night: night,
  alchemist: alchemist,
  streetfighter: streetfighter,
  cyberpunk: cyberpunk,
  greekgod: greekgod,
  beige84: beige84,
  colorarchive: colorarchive,
};

export const DEFAULT_THEME: ThemeId = 'simple';

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && v in THEMES;
}
