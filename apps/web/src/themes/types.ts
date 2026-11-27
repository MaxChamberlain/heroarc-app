/**
 * Theme "skin packs".
 *
 * Rule: numbers and pillars never depend on the theme. `@heroarc/domain` computes progress
 * per gear slot (heroProgress); a theme only decides what each slot is called and how
 * everything is drawn.
 *
 * Each theme lives in `src/themes/<id>/`: `vars.css` (one `[data-theme="<id>"]` rule declaring
 * every token in ../tokens.json) and `index.ts` (name, fonts, artwork variants, hero art).
 * To add one, copy a folder, change the id, and register it in registry.ts and vars.ts.
 */

export type ThemeId =
  | 'simple'
  | 'night'
  | 'alchemist'
  | 'streetfighter'
  | 'cyberpunk'
  | 'greekgod'
  | 'beige84'
  | 'colorarchive';

/** The four gear slots, each tied to one pillar. */
export type GearSlot = 'helm' | 'armor' | 'legs' | 'blade';

/** Fixed slot → pillar mapping (identical in every theme). */
export const SLOT_PILLAR: Record<GearSlot, string> = {
  helm: 'Rest',
  armor: 'Fuel',
  legs: 'Move',
  blade: 'Train',
};

export interface HeroPiece {
  /** Stroke colour of the piece. */
  color: string;
  /** Animation delay in seconds (pieces light up one after another). */
  delay: number;
  /** SVG markup for the piece, drawn in a 160×230 box. */
  svg: string;
}

/** Things CSS can't draw: which artwork the board uses for this theme. */
export interface ThemeVariants {
  /** The meter card: LED segments, or the Alchemist's hand-drawn gauges. */
  meter: 'led' | 'hand-drawn';
  /** Mood faces: simple line faces, or the Alchemist's engraved ones. */
  moodFace: 'line' | 'engraved';
}

export interface ThemeDefinition {
  id: ThemeId;
  /** Shown in Settings. */
  name: string;
  /** Browser chrome colour (<meta name="theme-color">). */
  deep: string;
  /** Google Fonts css2 query for every font the theme's vars.css names. */
  fonts: string;
  swatches: string[];
  /** Artwork CSS can't draw (colours, fonts and images live in vars.css). */
  variants: ThemeVariants;
  hero: {
    /** e.g. Samurai, The Adept, Fighter, Runner, Hoplite, Beige Box, Swatch Kid. */
    name: string;
    /** SVG path for the eyes (lit once the helm has progress). */
    eyes: string;
    slotNames: Record<GearSlot, string>;
    pieces: Record<GearSlot, HeroPiece>;
  };
}
