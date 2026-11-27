import { oc } from '@orpc/contract';
import { z } from 'zod';

export const CheckStatus = z.enum(['ok', 'fail', 'skipped']);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const SystemHealth = z.object({
  ok: z.boolean().describe('True when every dependency check passed.'),
  service: z.string(),
  version: z.string().describe('Git commit (on Render) or "dev".'),
  time: z.string().describe('Server time, ISO 8601.'),
  checks: z.record(z.string(), CheckStatus).describe('Per-dependency status, e.g. { db, kv }.'),
});
export type SystemHealth = z.infer<typeof SystemHealth>;

export const systemContract = {
  health: oc
    .route({
      method: 'GET',
      path: '/api/v1/system/health',
      summary: 'Deep health check (database and key-value store).',
      tags: ['system'],
    })
    .output(SystemHealth),
};
