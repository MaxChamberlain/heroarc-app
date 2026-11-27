## What & why

<!-- One or two sentences. Link the issue/request if there is one. -->

## How it was verified

- [ ] `pnpm verify` passes locally
- [ ] New behaviour has tests (unit in the package, e2e for user-visible flows)
- [ ] If the DB schema changed: `pnpm db:generate` ran and the migration is committed (expand/contract, no destructive SQL)
- [ ] If an API route changed: contract updated in `packages/contracts` first
- [ ] AGENTS.md / skills updated if a convention changed

## Screenshots (UI changes)
