# AGENTS.md: how to work on HeroArc

You are probably an AI agent (Hermes, Claude Code, …) asked to change this repo. Read this file first.
For a specific kind of change, also read the matching skill in [`.agents/skills/`](.agents/skills/).

## What HeroArc is

HeroArc is a health and fitness dashboard. You get an animated hero who gains gear as you sleep, eat, move and train well over a rolling 7 days. It shows today's Oura data (readiness, sleep, HRV, steps), nutrition against goals, training, habits, mood and trends.

- **Users:** invite-only, multi-user.
- **Agents:** AI agents log data through MCP and REST.
- **Coach:** an in-app chatbot that takes text, photos and voice notes.

It is a rebuild of an earlier single-user app (a Python Cloudflare Worker with Google Sheets). That app is the reference for features, formulas and art.

## Repo map

```
apps/web         TanStack Start (React 19). Routes in src/routes; proxies /api/* to the API (src/server/proxy.ts).
  src/features/board/       The dashboard at /: BoardPage (page), Grid (react-grid-layout board / stacked columns),
                            Header (hero, date nav), Customize, Sheet (drawer / bottom sheet), Dock (phone quick
                            actions), Settings, Card (frame), cards/* (one per card), charts, art.ts (SVG strings).
  src/features/coach/       Coach: the desktop column / phone sheet, composer (text, photos, voice notes),
                            receipts (Undo / Apply), chats and notes. Streams from /api/v1/coach/send.
  src/themes/<id>/          Theme skin packs: vars.css (the theme's list of CSS variables) and index.ts (name,
                            fonts, artwork variants, hero figure). Registered in registry.ts and vars.ts.
  src/themes/tokens.json    Every theme variable, with what it controls. themes/tokens.test.ts guards it.
  src/legacy/               The original single-file page, served at /legacy as the visual reference.
apps/api         NestJS 12 (ESM). src/main.ts = HTTP server, src/worker.ts = BullMQ worker (no HTTP).
  src/coach/                Coach: the Claude loop, chats, photos, transcription, the scripted test model.
  src/agent/                Agent tools (registry + implementations) and the action log with Undo.
packages/contracts  zod schemas + oRPC contract. THE source of truth for the web API (and later agent tools).
packages/domain  Pure business logic (energy balance, trends, hero progress, goals, quotes…). No I/O, unit-tested.
packages/db      Drizzle schema (src/schema), migrations (drizzle/), client, migrate + seed scripts.
packages/config  Shared tsconfig bases.
e2e              Playwright tests against the built apps.
scripts          CI/deploy helpers (CODEOWNERS-protected).
render.yaml      Render Blueprint (CODEOWNERS-protected).
```

Request flow: browser → `app.<domain>` (web) → `/api/*` proxy → API over Render's private network → Postgres and Valkey.
Sign-in lives on the same path (`/api/auth/*`), so its cookies are first-party on the web origin.
Agents and webhooks call `api.<domain>` directly.

## Commands

| Command                | What it does                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `pnpm install`         | Install everything (pnpm 10, Node 22).                                                 |
| `cp .env.example .env` | Local config. Change ports in `.env` if they're taken.                                 |
| `pnpm services:up`     | Start Postgres 18, Valkey 8 and Mailpit in Docker.                                     |
| `pnpm db:migrate`      | Apply migrations (build `@heroarc/db` first, or run `pnpm build`).                     |
| `pnpm db:seed`         | Replace the demo account's data with ~60 days of synthetic data; sign in as `demo` (password: `DEMO_PASSWORD`). |
| `pnpm user:invite`     | Print an invite link (`-- --admin` for an admin, `--email x` to tie it to one address).  |
| `pnpm dev`             | Services, then web (:3000), api (:4000) and worker, with watch.                        |
| `pnpm verify`          | **Definition of done:** Biome lint/format, typecheck, unit tests, build. Same as CI.   |
| `pnpm format`          | Auto-fix formatting and lint where safe.                                               |
| `pnpm db:generate`     | Create a migration after editing `packages/db/src/schema`.                             |
| `pnpm e2e`             | Playwright against the built apps (`pnpm build` first; needs services and migrations). |

## Golden rules

1. **Contract first.** A web API change starts in `packages/contracts`: schema plus route. Then implement it in `apps/api` with `@Implement(contract.x.y)`, then call it from `apps/web` via `orpc`/`api` in `src/lib/orpc.ts`. Never hand-write fetch calls or duplicate types.
2. **Math lives in `packages/domain`.** Calculations (goals, balances, trends, pillar and gear progress) are pure functions with unit tests. Controllers and components call them; they never re-implement them.
3. **Numbers never depend on the theme.** Themes change names, art and decorations only. See `apps/web/src/themes/types.ts`.
4. **Migrations are expand/contract.** Add new columns or tables, backfill, switch reads, and remove old things only in a later, separate PR. Destructive SQL fails CI unless a human approves it (see `db-migration` skill).
5. **Never edit generated files:** `apps/web/src/routeTree.gen.ts`, `packages/db/drizzle/meta/*`, `dist/`, `.output/`.
6. **No secrets in code.** Config comes from env vars, validated at startup (`apps/api/src/infra/env.ts`). Add new vars to `.env.example` with a comment.
7. **ESM everywhere.** In Node packages (api, db, domain, contracts), relative imports end in `.js` (e.g. `./trend.js`), even from `.ts` files. In `apps/web` (Vite), imports have no extension.
8. **NestJS DI uses `@Inject(TOKEN)`** for infrastructure (`ENV`, `DB`, `REDIS` from `apps/api/src/infra/tokens.ts`). Don't switch decorated constructor imports to `import type`; Nest needs the runtime metadata.
9. **Small PRs, one concern each**, with a Conventional Commit title (`feat(web): …`, `fix(api): …`, `chore: …`). Fill in the PR template.
10. **Update this file and the skills** when you introduce or change a convention.

## How your changes ship (read this, Hermes)

- Work on a branch and open a PR. **PRs auto-merge when every required check passes:**
  - `verify`
  - `migrations`
  - `e2e`
- Render deploys `main` only after checks pass (`autoDeployTrigger: checksPass`). A failing `/health` keeps the previous version live.
- **Paths that need a human review** (see `.github/CODEOWNERS`): CI workflows, `render.yaml`, `scripts/`, root `package.json`, `turbo.json`, `biome.json`, the destructive-migration allowlist, and `apps/api/src/auth/`.
  - Changing one of these is fine, but expect the PR to wait for a person.
  - Never try to work around these guardrails, for example by weakening tests or checks to make CI pass.
- If CI fails, read the logs, fix the cause, and push again. Don't disable or skip tests.

## The dashboard UI (read before touching it)

`/` is the dashboard: a PostHog-style widget board on desktop (12 columns, drag and resize), two columns on
tablets, one column on phones. It reads the snapshot (`GET /api/data`, built by `packages/domain/src/snapshot.ts`).
Code: `apps/web/src/features/board/`.

- **Layout is per account.** `GET/PUT /api/v1/layout` (`packages/contracts/src/layout.ts`), table `user_layouts`.
  Rules live in `packages/domain/src/layout.ts`: `CARD_SPECS` (sizes), `DEFAULT_LAYOUT`, `normalizeLayout`
  (always run on what's saved; saving `tiles: []` resets), `readingOrder` (phones and tablets stack cards in
  this order), `repack`.
- **Adding a card:** see the `add-dashboard-card` skill. Every card uses `Card`; tiles never overflow, so long
  content (editors, month views, a training session) opens in a `Sheet`.
- **A theme is one list of CSS variables.** `themes/<id>/vars.css` is a single `[data-theme="<id>"]` rule that
  declares every token in `themes/tokens.json`, and nothing else. Feature CSS (`src/features/**.css`, CSS
  Modules) only uses `var(--token)`: no literal colours, fonts or images. `themes/tokens.test.ts` enforces this.
  - New look needed? Add a token to `tokens.json` (with its description), give it a value in every
    `vars.css`, then use it. See the `add-theme` skill.
  - Variables set inline by code (e.g. hero piece colours) are declared in a `/* @vars c f d: … */` comment.
  - Things CSS can't draw are named `variants` in the theme's `index.ts` (hand-drawn meter, engraved faces).
- **Themes:** `simple` is the default and listed first; the gamified ones follow. The choice is a cookie
  (`heroarc_theme`), so the server renders the right theme with no flash. The board itself is client-rendered
  (`ssr: false`): it needs the device's width, locale, clock and storage.
- **Writes:**
  1. Call the API through `api.legacy.*` (from `useDashboard()`).
  2. Update the cached snapshot with `patch()`, either after the API says OK or optimistically with a
     rollback (see `useHabitTap` in `HabitsCard`).
- **SVG art** (hero figures, faces, meters) is built as strings in `art.ts` from constants and numbers, and
  rendered with `dangerouslySetInnerHTML`. Each use carries a `biome-ignore` with the reason. **Never put user
  text into those strings.**
- **Coach** is the first thing on the page: a column on desktop (collapsible, remembered per device), a
  header button on tablets, the first quick action on phones; `/` focuses it. See "Coach and agent tools".
- **Review every theme at `/dev/themes`**: every card and the hero in three states.
- **`/legacy` serves the original page**, on the same API, for reference. Don't add features to it; delete
  `src/legacy` and the route once nobody needs it.
- **Every request acts as the signed-in user.** All per-user code goes through `CurrentUserService`
  (`userId()`, `timeZone()`, `requireAdmin()`); never read a user id from input. See "Sign-in and accounts".
- The original's agents called a separate HTTP API: `POST /food`, `/weight`, `/training`, `/sync` and
  `GET /today`, with a bearer key. It still works on the API origin (see "Outside agents"), so Hermes only needs
  a new URL and key.

## Sign-in and accounts

- **Better Auth** (`apps/api/src/auth/auth.ts`, mounted in `main.ts` at `/api/auth/*`): email or username +
  password with a confirmed email, and Google when `GOOGLE_CLIENT_ID`/`SECRET` are set. Tables in
  `packages/db/src/schema/auth.ts`. This folder is CODEOWNERS-protected: expect a human review.
- **Invite-only.** `/invite/{code}` puts the code in the `heroarc_invite` cookie; a `user.create` hook refuses any
  new user (every method) without a valid invite, and marks it used. Admins invite from Settings → People;
  the first admin comes from `pnpm user:invite -- --admin`.
- **Sessions → current user:** `SessionMiddleware` resolves the session cookie, loads `user_profiles` (role,
  timezone, onboarded) and runs the request inside `requestContext` (AsyncLocalStorage). `/api/*` without a
  session is 401, except `/health`, `/api/auth/*`, `GET /api/v1/auth-options` and `GET /api/v1/invites/{code}`.
- **Web:** `features/account/` (pages, `authClient`, Settings → Account and People). The board sends signed-out
  people to `/sign-in` and new accounts to `/onboarding` (name, timezone).
- **Email:** `Mailer` (`auth/mailer.ts`): Resend when `RESEND_API_KEY` is set, otherwise SMTP to Mailpit
  (http://localhost:8025 shows every email locally).
- **Oura data never reaches an AI path** (Coach, and later MCP/REST agents): Oura's API agreement (§4(d)) only
  allows LLM use through Oura's own MCP server. `agent/no-wearables.test.ts` guards it.
- The service worker never caches `/api/*` (one device, several people).

## Coach and agent tools

Coach is the in-app assistant: text, up to four photos and voice notes in; streamed replies out.

- **Flow:** `POST /api/v1/coach/send` (multipart in, server-sent events out; `packages/contracts/src/coach.ts`)
  → `apps/api/src/coach/coach.service.ts` runs Claude (Messages API, streaming, tool use) in a loop with the
  agent tools → events (`text`, `status`, `receipt`, `app`, `changed`, `done`) → `features/coach/` in the web app.
- **Agent tools** live in one registry: `apps/api/src/agent/tools.ts` (schemas, descriptions, kind) and
  `agent.service.ts` (what they do). Phase 4's MCP/REST agents reuse it. Kinds:
  - `read`: no side effects.
  - `log`: new entries; applied at once with an Undo receipt.
  - `change`: edits, deletes, goals, habits, plan, dashboard; **proposed only**, applied when the user taps
    Apply. Never let a model change existing data without this gate.
  - `app`: act in the app (show a day, switch theme, open a card).
  Every write is recorded in `agent_actions` with what's needed to undo it. Adding a tool: see the
  `add-agent-tool` skill.
- **Storage:** chats and messages (`coach_chats`, `coach_messages`; the model's content blocks are stored
  exactly and replayed), photos (`coach_attachments`), notes Coach keeps about the user (`coach_notes`).
- **Prompt:** `coach/prompt.ts` is static (cached with the tools). Per-message facts (date, notes, photo ids)
  go in the `<context>` block of each user message, so the cached prefix never changes.
- **Config:** `ANTHROPIC_API_KEY` (Coach is off without it), `COACH_MODEL` (default `claude-opus-5-5`),
  `OPENAI_API_KEY` + `OPENAI_TRANSCRIBE_MODEL` for voice notes.
- **Tests never call Claude, OpenAI or Oura:** `COACH_MODEL=fake` swaps in a scripted model
  (`coach/fake-model.ts`) that understands a few phrases, and the scripted transcriber, even when keys are in
  `.env`. `OURA_CLIENT_ID=fake` does the same for Oura. CI's e2e job sets both; the specs that need them skip
  without them.
- **Replies render as Markdown** (`features/coach/Markdown.tsx`, react-markdown): raw HTML is dropped and
  images aren't loaded. Never render model text any other way.
- **Upload sizes:** app writes are capped at 16 KB by `HeroarcClientGuard`. A route that takes files declares
  its own limit with `@MaxBody(bytes)` (Coach send: 32 MB; the import: 11 MB).

## Oura

- **One HeroArc Oura application** (`OURA_CLIENT_ID` / `OURA_CLIENT_SECRET`; redirect
  `<APP_URL>/api/v1/oura/callback`; scopes `daily stress`). Each person connects their own ring; nobody else
  registers anything. A new Oura app allows 10 users until Oura approves it.
- **Code:** `apps/api/src/oura/`:
  - `oura-api.ts` is Oura's HTTP API, and `fake-oura.ts` the scripted stand-in (`OURA_CLIENT_ID=fake`).
  - `oura.service.ts` connects, syncs and disconnects.
  - `oura.controller.ts` serves `contract.oura` plus the browser callback.
  - The mapping from Oura's JSON to dashboard rows is pure: `packages/domain/src/oura.ts`.
- **Storage:** tokens in `oura_connections`, encrypted with `BETTER_AUTH_SECRET`. Refresh tokens are
  single-use, so refreshing happens under a row lock. Daily numbers go to `daily_metrics` with `source='oura'`;
  disconnecting deletes them. The first sync backfills 730 days, and later ones refresh the last 3.
- **Who syncs:** the worker every 30 minutes (`worker/oura-queue.service.ts`), the API on connect and on
  Refresh / Sync now. Hermes's `POST /sync` triggers a sync but only gets a count back.
- **Never to AI:** Coach and agents don't read `daily_metrics` (`agent/no-wearables.test.ts`).

## Importing the original app's data

Settings → "Import from the old HeroArc" takes the original Google Sheet downloaded as `.xlsx`
(`contract.import`: preview, then run).
- **Mapping** is pure, in `packages/domain/src/legacy-import.ts` (`readLegacyWorkbook`). It covers:
  - Settings (goals), Nutrition Log, Weight Log, Plan, Habits, Habit Log and Mood Log.
  - Training Log, where rows group into one session per logged event.
- **Reading and writing** are in `apps/api/src/import/` (read-excel-file; dates come back as day serials).
- **Re-importing is safe:** imported rows carry `legacy:…` event ids, so a second import adds only what's new.
- **Kept as they are:** goals and the plan, if the account already has its own; habit ticks already in HeroArc.
- **Not imported:** the Oura tab. That history comes from Oura once it's connected (Phase 3).

## Outside agents (n8n, Hermes, Claude, scripts)

Outside agents act for one user through the same tool registry as Coach, on the API origin (`API_URL`,
https://api.<domain>), never through the web app's session.

- **API keys:** Settings → Connections (`contract.connections`, `auth/agent-keys.ts`). Keys are `hak_…`, shown
  once; only a SHA-256 hash is stored (`agent_keys`). `AgentAuthMiddleware` (`auth/agent-auth.middleware.ts`)
  takes `Authorization: Bearer <key>` (or a bare key) on agent paths only (`/api/agent/*`, `/mcp`, the Hermes
  routes), runs the request as the key's owner and records the actor as `agent:<key name>` and
  `agent_actions.connection_id`. 120 requests a minute per key (Valkey; fails open after 250 ms). Session
  cookies never open agent paths, and keys never open app paths.
- **What they can call:** `externalTools()` in `agent/tools.ts`: everything except `app` tools and tools marked
  `coachOnly` (Coach's own notes). `change` tools only propose: the user applies them in Settings → Agent
  activity (`contract.activity`), which also offers Undo. A header badge counts proposals waiting.
- **MCP** at `/mcp` (`agent/mcp.ts`, `mcp.controller.ts`): `@modelcontextprotocol/server` v2's
  `createMcpHandler`, stateless, POST only. It serves MCP 2026-07-28 and, through the SDK's stateless legacy
  fallback, 2025-era clients (n8n, Hermes, older SDKs), one server instance per request. The user arrives in
  `authInfo.extra` from the auth middleware. Auth is an API key, or an OAuth access token (next bullet).
- **OAuth for apps that sign in** (Claude, ChatGPT connectors): Better Auth's `jwt()` + `mcp()` (from
  `@better-auth/mcp`) + `cimd()` in `auth/auth.ts`. The issuer is `<APP_URL>/api/auth`; tokens are bound to
  the resource `<API_URL>/mcp`. Dynamic client registration is on (`clientRegistrationDefaultApplicationType:
  'infer'`, so loopback redirects register as native apps). Sign-in uses `/sign-in` (the client plugin carries
  the signed `oauth_query`), consent is `/connect/consent`. Discovery: Better Auth answers `/.well-known/*` on
  both origins (the API routes it there; the web app forwards it). `/mcp` verifies tokens itself
  (`auth/oauth-tokens.ts`: signature from in-process keys, issuer, audience, `typ: at+jwt`, `azp`) and also
  requires the user's consent to still exist, so Disconnect in Settings → Connections ends access at once.
  Tokens are for `/mcp` only. Tables: `packages/db/src/schema/oauth.ts` (field names are Better Auth's).
  Signing keys are encrypted with `BETTER_AUTH_SECRET`; at startup `auth/signing-keys.ts` drops keys an old
  secret made (apps then refresh their tokens).
- **The web proxy passes `x-forwarded-sec-fetch-mode`** (Node's fetch always sends `sec-fetch-mode: cors`);
  the API restores it for Better Auth, which answers page visits with redirects and fetches with JSON.
- **REST:** `GET /api/agent/v1/tools`, `POST /api/agent/v1/tools/{name}` (`contract.agent`,
  `agent/agent-api.controller.ts`). OpenAPI 3.1 built from the registry at `GET /api/agent/v1/openapi.json`
  (public, `agent/openapi.ts`).
- **The original API** (`agent/hermes.ts` maps bodies to tool inputs, `hermes.controller.ts` serves them):
  `GET /today` (Oura fields null), `POST /food`, `/weight`, `/training` (calls for the same workout on a day add
  up), `/sync` (503 until Oura sync exists). Replies keep `{ ok, result }` / `{ ok: false, error }`.
- **Oura data never reaches agents** (see "Sign-in and accounts"); `agent/no-wearables.test.ts` guards it.

## Build status / roadmap

Phases from the rebuild plan. Build only what the current phase needs.

- [x] **Phase 0 – Scaffold:**
  - monorepo, CI, Render Blueprint
  - web ↔ proxy ↔ API ↔ Postgres/Valkey health path
  - worker with a heartbeat queue
- [x] **Phase 1 – Auth:** Better Auth (email/password with verification, username, Google), invite-only sign-up, profile and onboarding.
  Google needs an OAuth client (`GOOGLE_CLIENT_ID`/`SECRET`); production needs `BETTER_AUTH_SECRET` and `RESEND_API_KEY`.
- [x] **Phase 2a – Data and API parity:**
  - Postgres schema for metrics, weight, meals, habits, mood, training and goals
  - snapshot builder and the compatibility API
  - original page served at `/`
  - demo seed
- [x] **Phase 2b – React port:**
  - every card, the hero, meters, sections, Settings and Arrange in React
  - the 7 themes as skin packs, PWA manifest and service worker
  - pixel-compared against the original in every theme
- [x] **Phase 2c – Responsive board:**
  - widget board with per-account layout, token themes (Simple + 7 gamified), Coach UI
  - fat and carbs goals (optional, per account)
- [ ] **Phase 2d – Next UI work:**
  - a meals card (today meals arrive only from agents)
  - retire `src/legacy` once signed off
- [x] **Phase 3 – Oura:** connect (OAuth + PKCE) in Settings and onboarding, 2-year backfill, worker sync every
      30 minutes, Refresh, disconnect deletes. (No webhooks yet: Oura's docs for them couldn't be confirmed.)
- [x] **Phase 4 – Agent API:** API keys, REST tools + OpenAPI, the original Hermes API, MCP at `/mcp`
      (keys or OAuth), OAuth sign-in and consent for Claude / ChatGPT connectors, Agent activity (Apply / Undo).
      How to connect each tool: `docs/connect.md`. Needs HTTPS `APP_URL` / `API_URL` in production.
- [x] **Phase 5 – Coach:** Claude with the agent tools, photos, voice notes (OpenAI), saved chats, notes,
      receipts with Undo, Apply for changes, dashboard rearranging, app actions.
- [ ] **Phase 6 – Migration:**
  - [x] import the Google Sheet history (Settings → Import)
  - [ ] cut Hermes over (new URL and key; MCP or the original API)

## Testing conventions

| Area              | What to test            | How                                                                                                                                                                                    |
| ----------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain` | every exported function | Vitest, including edge cases. Use real numbers from the original app as fixtures where possible.                                                                                       |
| `apps/api`        | controllers             | Vitest + `@nestjs/testing` + supertest, with fake providers for `DB`/`REDIS` (see `src/system/system.controller.test.ts`). Tests are transformed with SWC so decorator metadata works. |
| `apps/web`        | server helpers          | Vitest in a Node environment.                                                                                                                                                          |
| `apps/web`        | user-visible flows      | Playwright in `e2e/`: `tests/board.spec.ts` (every write flow, customize, themes; checks the API afterwards), `tests/coach.spec.ts`, `tests/auth.spec.ts` (sign-in, invites, email links read from Mailpit's API; starts signed out), `tests/connections.spec.ts` (keys, REST, MCP, Hermes API, Agent activity) and `tests/oauth.spec.ts` (an MCP client's whole OAuth flow). The `setup` project signs in as the seeded demo account; other tests reuse that session. CI seeds demo data first. Tests share the demo user, so never assume a clean day. |
