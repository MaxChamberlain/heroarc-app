---
name: add-dashboard-card
description: Add or change a card on the HeroArc dashboard board (React, apps/web/src/features/board). Covers registering the card (contracts CARD_IDS, domain CARD_SPECS/DEFAULT_LAYOUT, BOARD_CARDS), the Card frame, drawers (Sheet), reading the snapshot, saving through the API with optimistic updates, token-only styling, and tests.
---

# Add a dashboard card

Read "The dashboard UI" section of AGENTS.md first.

## 1. Register it (three places, in this order)

1. `packages/contracts/src/layout.ts`: add the id to `CARD_IDS`.
2. `packages/domain/src/layout.ts`:
   - `CARD_SPECS`: default size and min/max, in grid units (12 columns; one row is 30 px plus a 16 px gap).
   - `DEFAULT_LAYOUT`: where new accounts see it.

   Saved layouts pick the card up automatically: `normalizeLayout` appends missing cards at the bottom.
   Run `pnpm --filter @heroarc/domain test`: the default layout must have no overlaps.
3. `apps/web/src/features/board/cards.ts`: add it to `BOARD_CARDS` with its title (shown in Customize), a group
   (Today / Log / Trends) and the component.

## 2. Build it

- Put it in `features/board/cards/<Name>Card.tsx` and wrap it in `Card` (`title`, optional `actions` for
  small toggles, optional `footer` for buttons).
- Read data with `useDashboard()`: `data` (the snapshot), `sel` (selected day), `today`, `isToday`.
  Calculations belong in `packages/domain` (pure, unit-tested). Components never re-implement them.
- **Tiles never overflow.** Keep the card compact at its minimum size. Long content (forms, month grids,
  multi-step flows) opens in a `Sheet`: a drawer on desktop, a bottom sheet on phones.
- On phones and tablets cards are auto-height (`AutoHeightContext` is true). On desktop they fill the tile
  and the body scrolls as a fallback.

## 3. Save data

1. Call the API through `api.legacy.*` (or a new contract route; see the `add-api-endpoint` skill).
2. Update the cached snapshot with `patch()`, either after the API says OK or optimistically with a rollback.
   See `useHabitTap` in `HabitsCard.tsx`.
3. Show the result with `toast()`.
4. Use client event ids (`eventId()` from `lib.ts`) so retries are harmless.

## 4. Style it

- Use a CSS Module next to the component (or the shared classes in `ui.module.css`: `row`, `label`, `value`,
  `big`, `btn`, `primary`, `input`, `seg`, `chips`, `switchRow`, `note`, `done`…).
- **Only `var(--token)`** for colours, fonts, radii, shadows and images. Tokens are listed in
  `themes/tokens.json`. If nothing fits, add a token (see the `add-theme` skill) rather than a literal value.
  `themes/tokens.test.ts` fails on literal colours, fonts or images in feature CSS.
- CSS Modules hash class names: apply state classes from the module (`s.on`), not as plain strings.

## 5. Test it

- Unit-test any new domain function (`packages/domain`).
- `e2e/tests/board.spec.ts`: every write flow, checking the API afterwards. Tests share the demo user, so
  never assume a clean day. Use `[data-tile="<id>"]` to find the card.
- Check it at `/dev/themes` (every card in every theme) and at phone width.
- Run `pnpm verify`.
