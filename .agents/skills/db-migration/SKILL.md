---
name: db-migration
description: Change the HeroArc Postgres schema safely (Drizzle schema edit → generated SQL migration → expand/contract rollout). Use for any new table, column, index or data change in packages/db.
---

# Database migrations

Schema lives in `packages/db/src/schema/*.ts` (Drizzle, `casing: 'snake_case'`, so `updatedAt` becomes `updated_at`). Migrations are SQL files in `packages/db/drizzle/`, generated, never hand-written from scratch. Render applies them before every API deploy (`preDeployCommand`).

## Steps

1. Edit or add a schema file in `packages/db/src/schema/` and export it from `src/schema/index.ts`.
   - Every per-user table gets a `userId` column with an index.
   - Use `timestamp({ withTimezone: true })` for instants and a `date` column for the user's local day.
2. `pnpm db:generate` creates `packages/db/drizzle/NNNN_<name>.sql` and updates `drizzle/meta`.
   - Pass `--name <short_name>` for a readable filename, e.g. `pnpm db:generate --name add_meals`.
3. Read the generated SQL. Make sure it does only what you intended.
4. `pnpm --filter @heroarc/db build && pnpm db:migrate` applies it locally (needs `pnpm services:up`).
5. Commit the schema change **and** the generated files together. CI fails if they're out of sync.

## Expand / contract (no downtime, no data loss)

The old and new app versions overlap briefly during a deploy, so a migration must work with both.

- **Add:** new nullable columns, or columns with defaults; new tables and indexes. Always safe.
- **Rename or change a type:** add the new column, then backfill, then switch code to it. Drop the old column in a **later** PR.
- **Remove:** stop using it in code first and ship that. Drop it in a separate PR.

## Destructive SQL needs a human

`scripts/check-destructive-migrations.mjs` (CI job `migrations`) fails if a migration contains any of these, unless the migration's filename is listed in `packages/db/destructive-allowlist.txt`:

- `DROP TABLE`, `DROP COLUMN`, `DROP TYPE` or `DROP SCHEMA`
- `RENAME`
- a column type change
- `TRUNCATE` or `DELETE FROM`

That allowlist is CODEOWNERS-protected, so a human must approve. Don't try to get around the check, for example by splitting statements or hiding them in functions.
