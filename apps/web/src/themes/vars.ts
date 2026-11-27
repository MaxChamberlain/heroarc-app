/*
 * Every theme's variable list (themes/<id>/vars.css), for the board. Each file is one
 * `[data-theme="<id>"] { … }` rule, so all of them can be loaded at once.
 */
import alchemist from './alchemist/vars.css?raw';
import beige84 from './beige84/vars.css?raw';
import colorarchive from './colorarchive/vars.css?raw';
import cyberpunk from './cyberpunk/vars.css?raw';
import greekgod from './greekgod/vars.css?raw';
import night from './night/vars.css?raw';
import simple from './simple/vars.css?raw';
import streetfighter from './streetfighter/vars.css?raw';

export const THEME_VARS_CSS = [
  simple,
  night,
  alchemist,
  streetfighter,
  cyberpunk,
  greekgod,
  beige84,
  colorarchive,
].join('\n');
