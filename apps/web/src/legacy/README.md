# The original HeroArc page (reference only)

`index.html` here is the original single-file HeroArc app by the HeroArc contributors (MIT).
It comes from `app/index.html` in github.com/erguniozdjan/heroarc, branch `main`, commit `6a3784b` (v72, 2026-11-19).
`public/manifest.json`, `public/icon.svg` and the two PNG icons come from the same commit (`public/sw.js` started there too).

## What it's for now

- **The responsive board at `/` replaces it** (re-laid out, not a pixel copy). `src/routes/legacy.ts` still serves this file unchanged at `/legacy`, on the same API and data, as a reference for features and each theme's look.
- **Its themes** were rebuilt as CSS-variable lists in `src/themes/<id>/vars.css` (plus each theme's hero art in `index.ts`). Those are now the ones that matter.

## Taking upstream changes

1. Fetch the upstream repo and diff `app/index.html` against the commit above.
2. Copy the new file over this one.
3. Port the change to the board: features to `src/features/board`, look changes to the theme's `vars.css`
   (add a token if needed; see the `add-theme` skill). Compare `/legacy` and `/dev/themes`.
4. Update the commit above.

The `notion-backend` branch upstream is a storage backend for the old scripts, with no UI changes; this app ignores it.

## Rules

- Don't add features here.
- Delete this folder and `src/routes/legacy.ts` once nobody needs the comparison.
- The `legacy` API contract stays: the React app uses it.
