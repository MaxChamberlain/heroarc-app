# One-time setup: GitHub, Render, DNS

You do this once, by hand. Agents can't do it, because it needs account access.

## 1. GitHub

1. Create the repo and push `main`.
2. **Branch protection on `main`** (Settings → Branches → Add rule, or Rulesets):
   - Require a pull request before merging.
   - Require status checks to pass: `verify (lint, typecheck, unit tests, build)`, `migrations (in sync, non-destructive, apply cleanly)`, `e2e (Playwright against built web + api)`.
   - **Require review from Code Owners** (this enforces `.github/CODEOWNERS`).
   - Require linear history. Block force pushes.
3. **Allow auto-merge** (Settings → General → Pull Requests).
4. **Hermes's access:**
   - Create a GitHub bot account and add it as a collaborator with **Write** (not Admin).
   - Give Hermes a fine-grained PAT for this repo only, with Contents, Pull requests and Workflows read/write.
   - Tell Hermes to open PRs with auto-merge enabled: `gh pr create … && gh pr merge --auto --squash`.
5. Add `erguniozdjan` as a collaborator with **Write** access. CODEOWNERS lists them next to you, and a code owner's approval only counts with Write access.

## 2. Render

1. In Render: **New → Blueprint**, pick this repo. It reads `render.yaml` and creates:
   - `heroarc-web`, `heroarc-api` and `heroarc-worker`
   - `heroarc-db` (Postgres 18) and `heroarc-kv` (Key Value)
2. Services deploy only after GitHub checks pass on `main` (`autoDeployTrigger: checksPass`).
3. Check after the first deploy:
   - `https://<heroarc-web>.onrender.com/healthz` returns `{"ok":true}`
   - `/api/v1/system/health` returns `"ok":true` with `db` and `kv` both `ok`

**If the build can't find pnpm**, set `NODE_VERSION` or check `scripts/render-build.sh` output. The script enables the pnpm version pinned in `package.json` through Corepack, and falls back to npm.

## 3. Custom domain

1. **Web service** → Settings → Custom Domains → add `app.<domain>`. Create the CNAME Render shows you.
2. **API service** → add `api.<domain>` the same way. Agents, MCP and webhooks use this host.
3. Uncomment the `domains:` lines in `render.yaml` so the Blueprint matches. That file is CODEOWNERS-protected.

## 4. Settings Render asks for (on `heroarc-api`)

When you create the Blueprint, Render asks for these. You can change them later under
heroarc-api → Environment. `BETTER_AUTH_SECRET` is generated for you.

| Setting | Value |
|---|---|
| `APP_URL` | `https://app.<domain>`. Before the domain works, use the web service's `https://….onrender.com` address and change it later. |
| `API_URL` | `https://api.<domain>` (or the API's `onrender.com` address at first) |
| `RESEND_API_KEY` | From Resend, after you verify `<domain>` there (it shows the DNS records to add) |
| `MAIL_FROM` | `HeroArc <hello@<domain>>`, using an address on the verified domain |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google OAuth client. Add `https://app.<domain>` as an origin and `https://app.<domain>/api/auth/callback/google` as a redirect. Leave both empty to hide Google sign-in. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Coach, and voice notes |

Changing `APP_URL` or `API_URL` later means updating Google's redirect too. Apps connected through
OAuth will also need to connect again, because their tokens are tied to these addresses.

## 5. The first admin

Sign-up is invite-only, so the first account needs an invite made on the server:

1. Render → heroarc-api → **Shell**.
2. Run `node packages/db/dist/invite.js --admin --email you@example.com`.
3. Open the link it prints, create your account, and confirm your email.
4. Invite everyone else from Settings → People.

## 6. Later (Phase 3, Oura)

- The Oura client ID and secret, from HeroArc's own Oura developer app.
- A token-encryption key.
