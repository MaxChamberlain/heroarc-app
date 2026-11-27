---
name: add-theme
description: Add or change a HeroArc theme (apps/web/src/themes/<id>/): its list of CSS variables (vars.css, every token in tokens.json), fonts, artwork variants and hero figure (gear names and SVG art). Use when asked for a new look, a colour or font change, or a new visual token.
---

# Add or change a theme

A theme is **one list of CSS variables**: change a colour, font or decoration in exactly one place.
Every other piece of code references the variables by name.

## The files

`apps/web/src/themes/<id>/`:

- **`vars.css`**: a single rule, `[data-theme="<id>"] { --token: value; … }`, declaring **every** token in
  `themes/tokens.json` and nothing else. It holds no other selectors.
  - Images are `url(...)` values: data-URI SVGs are fine.
  - Labels are CSS strings (`"SYS//"`).
  - Unused decorations are `none`, `0px`, `""` or `transparent` (each token's description says which).
- **`index.ts`**: the `ThemeDefinition`:
  - `name`
  - `deep` (browser chrome colour)
  - `fonts` (Google Fonts css2 query for every font `vars.css` names)
  - `swatches` (Settings preview)
  - `variants` (artwork CSS can't draw: `meter: 'led' | 'hand-drawn'`, `moodFace: 'line' | 'engraved'`)
  - `hero`: the name, slot names, and the four SVG pieces (helm/armor/legs/blade), drawn in a 160×230 box,
    stroke-only, each with its colour and animation delay

## Add a theme

1. Copy a folder (`simple` is the plainest; `cyberpunk` uses the most decorations). Rename it and change the id
   in `index.ts` and in the `vars.css` selector.
2. Add the id to `ThemeId` (`types.ts`), then `THEME_ORDER` and `THEMES` (`registry.ts`), then `vars.ts`.
3. Edit the values. Each token's description in `tokens.json` says what it controls.
4. Review it at `/dev/themes` (every card and three hero states) and on `/` at phone and desktop widths.

## Add a token (a new thing a theme can change)

1. Add it to `themes/tokens.json` with a one-line description.
2. Give it a value in **every** `themes/*/vars.css`. The test fails if any theme is missing it.
3. Use it in feature CSS as `var(--name)`.

## Rules

- **Numbers never depend on the theme.** A theme changes names, colours, fonts and artwork only.
  Progress comes from `heroProgress` in `@heroarc/domain`.
- No literal colours, fonts or images in feature CSS (`src/features/**.css`).
- `themes/tokens.test.ts` checks all of this. Run `pnpm verify`.
- Check contrast: text on `--acc` uses `--on-acc`, and primary buttons need readable `--btn-primary-fg`.
