---
name: add-api-endpoint
description: Add or change a HeroArc web API endpoint end to end (zod contract in packages/contracts → NestJS implementation in apps/api → typed call from apps/web → tests). Use whenever the web app needs new data or a new action from the API.
---

# Add an API endpoint

The contract in `packages/contracts` is the single source of truth. Types flow from it to the API and the web app, so never duplicate a type or hand-write a `fetch`.

Worked example already in the repo: `contract.system.health`.

- `packages/contracts/src/system.ts`
- `apps/api/src/system/system.controller.ts`
- `apps/web/src/routes/index.tsx`

## 1. Contract (`packages/contracts/src/<group>.ts`)

```ts
import { oc } from '@orpc/contract';
import { z } from 'zod';

export const WeightEntry = z.object({ id: z.string(), date: z.string(), weightKg: z.number() });

export const weightContract = {
  log: oc
    .route({ method: 'POST', path: '/api/v1/weight', summary: 'Log a weigh-in', tags: ['weight'] })
    .input(z.object({ date: z.string(), weightKg: z.number().positive() }))
    .output(WeightEntry),
};
```

- Paths are the **full path the API serves**, always under `/api/v1/…`. The web proxy forwards `/api/*` unchanged.
- Register the group in `packages/contracts/src/index.ts` (`contract = { system, weight, … }`) and re-export its schemas.
- Use `.describe()` on fields agents will see. The same schemas feed the agent tools later.

## 2. Implementation (`apps/api/src/<group>/<group>.controller.ts`)

```ts
@Controller()
export class WeightController {
  constructor(@Inject(DB) private readonly db: DbHandle) {}

  @Implement(contract.weight.log)
  log() {
    return implement(contract.weight.log).handler(async ({ input }) => {
      // call a service / packages/domain function; return data matching the output schema
    });
  }
}
```

- Add the controller to the module's `controllers` (start with `AppModule`; split into feature modules as the code grows).
- Put business logic in a service or in `packages/domain`, not in the handler.
- Inject infrastructure with `@Inject(ENV | DB | REDIS)` from `src/infra/tokens.ts`.

## 3. Web (`apps/web`)

```ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { orpc } from '../lib/orpc';

const health = useQuery(orpc.system.health.queryOptions());
const logWeight = useMutation(orpc.weight.log.mutationOptions());
```

## 4. Tests

- API: a Vitest + supertest test next to the controller, using fake providers. Copy `apps/api/src/system/system.controller.test.ts`.
- Domain logic: unit tests in `packages/domain`.
- User-visible flow: a Playwright test in `e2e/tests/`.

## 5. Finish

Run `pnpm verify`. Then open a PR with a Conventional Commit title, e.g. `feat(api): log weight`.
