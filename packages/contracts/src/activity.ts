import { oc } from '@orpc/contract';
import { z } from 'zod';
import { ActionResult, Receipt } from './coach.js';

/*
 * Agent activity: what outside agents (API keys, later OAuth connections) did or proposed.
 * Their edits wait here for the user's Apply; anything applied can be undone. Coach's own
 * proposals stay in its chat.
 */

export const AgentActivity = Receipt.extend({
  /** The agent's name, as the user named its key ("Hermes"). */
  agent: z.string(),
  /** When it happened (ISO). */
  at: z.string(),
});
export type AgentActivity = z.infer<typeof AgentActivity>;

const Id = z.string().uuid();

export const activityContract = {
  list: oc
    .route({
      method: 'GET',
      path: '/api/v1/activity',
      summary: "Outside agents' proposals waiting for you, and what they did recently.",
      tags: ['activity'],
    })
    .output(z.object({ pending: z.array(AgentActivity), recent: z.array(AgentActivity) })),
  confirm: oc
    .route({
      method: 'POST',
      path: '/api/v1/activity/{id}/confirm',
      summary: 'Apply a proposal.',
      tags: ['activity'],
    })
    .input(z.object({ id: Id }))
    .output(ActionResult),
  cancel: oc
    .route({
      method: 'POST',
      path: '/api/v1/activity/{id}/cancel',
      summary: 'Decline a proposal.',
      tags: ['activity'],
    })
    .input(z.object({ id: Id }))
    .output(ActionResult),
  undo: oc
    .route({
      method: 'POST',
      path: '/api/v1/activity/{id}/undo',
      summary: 'Undo what an agent did.',
      tags: ['activity'],
    })
    .input(z.object({ id: Id }))
    .output(ActionResult),
};
