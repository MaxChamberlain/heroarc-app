import { AsyncLocalStorage } from 'node:async_hooks';

/** Who a request acts for (set by SessionMiddleware or the agent auth guard). */
export interface RequestUser {
  userId: string;
  timeZone: string;
  role: 'admin' | 'member';
  /** How they authenticated: the app's session cookie, or an agent key / token. */
  via: 'session' | 'agent';
  /** For agents: the connection (agent_keys id) and who to record as acting ('agent:Hermes'). */
  connectionId?: string;
  actor?: string;
}

export const requestContext = new AsyncLocalStorage<RequestUser>();
