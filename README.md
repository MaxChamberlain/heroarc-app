# HeroArc

A health and fitness dashboard with a hero who levels up as you rest, fuel, move and train. It is a Turborepo monorepo:

- **Web:** TanStack Start
- **API and worker:** NestJS
- **Data:** Postgres and Valkey
- **Hosting:** Render

AI agents (e.g. Hermes) can maintain the code and log data.

- **Working on the code (people and agents):** start with [AGENTS.md](AGENTS.md).
- **First-time deploy (Render, GitHub, DNS):** [docs/setup.md](docs/setup.md).
- **Connecting Claude, ChatGPT, n8n, Hermes or scripts:** [docs/connect.md](docs/connect.md).

## Quick start

```bash
pnpm install
cp .env.example .env        # change ports if 5432/6379 are taken
pnpm services:up            # Postgres 18, Valkey 8, Mailpit (Docker)
pnpm build && pnpm db:migrate
pnpm db:seed                # demo data (sign-in comes later; everyone is the demo user)
pnpm dev                    # web http://localhost:3000, api http://localhost:4000
```

`pnpm verify` runs everything CI runs except e2e. Run e2e with `pnpm e2e`.
