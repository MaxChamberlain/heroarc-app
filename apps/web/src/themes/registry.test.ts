import { THEME_IDS } from '@heroarc/contracts';
import { describe, expect, it } from 'vitest';
import { THEME_ORDER } from './registry';

describe('themes', () => {
  it('match the theme ids Coach knows (packages/contracts THEME_IDS)', () => {
    expect([...THEME_ORDER].sort()).toEqual([...THEME_IDS].sort());
  });
});
