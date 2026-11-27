import { oc } from '@orpc/contract';
import { z } from 'zod';

/*
 * Connections: how a user lets outside agents (n8n, Hermes, Claude, scripts) act for them.
 * API keys are created here; the agent API itself is in agent.ts.
 */

export const AgentKey = z.object({
  id: z.string(),
  /** What the user called it ("Hermes"). */
  name: z.string(),
  /** The start of the key, to tell keys apart ("hak_3f9c"). */
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type AgentKey = z.infer<typeof AgentKey>;

/** An app the user connected by signing in (OAuth), e.g. Claude or ChatGPT. */
export const ConnectedApp = z.object({
  clientId: z.string(),
  /** The name the app gave itself (unverified). */
  name: z.string(),
  /** Where it sends people back to (its redirect host), to tell apps apart. */
  host: z.string().nullable(),
  connectedAt: z.string(),
});
export type ConnectedApp = z.infer<typeof ConnectedApp>;

export const Connections = z.object({
  /** Where agents reach the API (https://api.<domain>). */
  apiUrl: z.string(),
  keys: z.array(AgentKey),
  apps: z.array(ConnectedApp),
});
export type Connections = z.infer<typeof Connections>;

export const connectionsContract = {
  list: oc
    .route({
      method: 'GET',
      path: '/api/v1/connections',
      summary: 'API keys and where agents connect.',
      tags: ['connections'],
    })
    .output(Connections),
  createKey: oc
    .route({
      method: 'POST',
      path: '/api/v1/connections/keys',
      summary: 'Create an API key. The key is returned once; only a hash is kept.',
      tags: ['connections'],
    })
    .input(z.object({ name: z.string().trim().min(1).max(40) }))
    .output(z.object({ key: AgentKey, secret: z.string() })),
  disconnectApp: oc
    .route({
      method: 'DELETE',
      path: '/api/v1/connections/apps/{clientId}',
      summary: 'Disconnect an app: its access ends at once, and it must ask again to reconnect.',
      tags: ['connections'],
    })
    .input(z.object({ clientId: z.string().min(1).max(500) }))
    .output(z.object({ ok: z.literal(true) })),
  revokeKey: oc
    .route({
      method: 'DELETE',
      path: '/api/v1/connections/keys/{id}',
      summary: 'Revoke an API key: agents using it stop working at once.',
      tags: ['connections'],
    })
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) })),
};
