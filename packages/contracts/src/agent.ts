import { oc } from '@orpc/contract';
import { z } from 'zod';
import { Receipt } from './coach.js';

/*
 * The agent API: outside agents call HeroArc's agent tools (the same ones Coach uses) with
 * `Authorization: Bearer <API key>`. New entries apply at once (Undo in the app); edits and
 * deletes become proposals the user approves in HeroArc. Served on the API origin
 * (https://api.<domain>); the OpenAPI document is at /api/agent/v1/openapi.json.
 */

export const AgentToolInfo = z.object({
  name: z.string(),
  /** read: no side effects · log: applied at once, undoable · change: needs the user's approval. */
  kind: z.enum(['read', 'log', 'change']),
  description: z.string(),
  /** JSON Schema of the input. */
  input_schema: z.record(z.string(), z.unknown()),
});
export type AgentToolInfo = z.infer<typeof AgentToolInfo>;

export const AgentCallResult = z.object({
  ok: z.boolean(),
  /** What the tool returned: data for reads, a sentence for writes. */
  result: z.unknown(),
  /** For writes: what was done (applied) or proposed (pending, waiting for the user). */
  receipt: Receipt.optional(),
});
export type AgentCallResult = z.infer<typeof AgentCallResult>;

export const agentContract = {
  tools: oc
    .route({
      method: 'GET',
      path: '/api/agent/v1/tools',
      summary: 'The tools an agent can call, with input schemas.',
      tags: ['agent'],
    })
    .output(z.object({ tools: z.array(AgentToolInfo) })),
  call: oc
    .route({
      method: 'POST',
      path: '/api/agent/v1/tools/{name}',
      summary: 'Call a tool. The body is its input.',
      tags: ['agent'],
      inputStructure: 'detailed',
    })
    .input(
      z.object({
        params: z.object({ name: z.string().max(40) }),
        body: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .output(AgentCallResult),
};
