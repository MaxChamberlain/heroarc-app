import { contract } from '@heroarc/contracts';
import { createORPCClient } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { apiOrigin } from './api-origin';

// In the browser, call our own origin (the /api proxy). On the server (SSR),
// call the API directly over the private network.
const link = new OpenAPILink(contract, {
  url: () => (typeof window === 'undefined' ? apiOrigin() : window.location.origin),
  // Marks requests as coming from the app (the API refuses writes without it; see HeroarcClientGuard).
  headers: { 'x-heroarc': '1' },
});

/** Typed API client generated from @heroarc/contracts. */
export const api: JsonifiedClient<ContractRouterClient<typeof contract>> = createORPCClient(link);

/** TanStack Query helpers: useQuery(orpc.system.health.queryOptions()). */
export const orpc = createTanstackQueryUtils(api);
