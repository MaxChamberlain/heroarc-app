import { oc } from '@orpc/contract';
import { z } from 'zod';

/*
 * Oura: connecting a ring (OAuth with HeroArc's Oura application), syncing its daily numbers
 * (sleep, readiness, HRV, steps, stress) into the dashboard, and disconnecting (which deletes
 * them). Oura's sign-in returns to GET /api/v1/oura/callback (a browser redirect, not part of
 * this contract). Oura data never goes to Coach or agents.
 */

export const OuraStatus = z.object({
  /** HeroArc has an Oura application configured (otherwise there's nothing to connect). */
  available: z.boolean(),
  connected: z.boolean(),
  /** ok · reconnect (Oura no longer accepts the connection: connect again) · error (last sync failed). */
  status: z.enum(['ok', 'reconnect', 'error']).nullable(),
  lastSyncAt: z.string().nullable(),
  /** The first day synced so far. */
  syncedFrom: z.string().nullable(),
  /** Scopes the dashboard needs that weren't granted on Oura's consent screen. */
  missingScopes: z.array(z.string()),
});
export type OuraStatus = z.infer<typeof OuraStatus>;

export const ouraContract = {
  status: oc
    .route({
      method: 'GET',
      path: '/api/v1/oura',
      summary: 'Oura connection status.',
      tags: ['oura'],
    })
    .output(OuraStatus),
  connect: oc
    .route({
      method: 'POST',
      path: '/api/v1/oura/connect',
      summary: "Start connecting Oura: returns Oura's sign-in page to open.",
      tags: ['oura'],
    })
    .input(z.object({ returnTo: z.enum(['settings', 'onboarding']).default('settings') }))
    .output(z.object({ url: z.string() })),
  sync: oc
    .route({
      method: 'POST',
      path: '/api/v1/oura/sync',
      summary: 'Sync recent days from Oura now (the Refresh button).',
      tags: ['oura'],
    })
    .output(OuraStatus.extend({ days: z.number() })),
  disconnect: oc
    .route({
      method: 'DELETE',
      path: '/api/v1/oura',
      summary: 'Disconnect Oura and delete the Oura data HeroArc stored.',
      tags: ['oura'],
    })
    .output(z.object({ ok: z.literal(true) })),
};
