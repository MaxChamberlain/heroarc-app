import { contract, type SystemHealth } from '@heroarc/contracts';
import { type DbHandle, sql } from '@heroarc/db';
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import type { Redis } from 'ioredis';
import type { Env } from '../infra/env.js';
import { DB, ENV, REDIS } from '../infra/tokens.js';

const CHECK_TIMEOUT_MS = 2000;

async function check(fn: () => Promise<unknown>): Promise<'ok' | 'fail'> {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS)),
    ]);
    return 'ok';
  } catch {
    return 'fail';
  }
}

@Controller()
export class SystemController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: DbHandle,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Implement(contract.system.health)
  health() {
    return implement(contract.system.health).handler(async (): Promise<SystemHealth> => {
      const [db, kv] = await Promise.all([
        check(() => this.db.db.execute(sql`select 1`)),
        check(() => this.redis.ping()),
      ]);
      return {
        ok: db === 'ok' && kv === 'ok',
        service: 'heroarc-api',
        version: this.env.version,
        time: new Date().toISOString(),
        checks: { db, kv },
      };
    });
  }
}
