import { createDb, type DbHandle } from '@heroarc/db';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { type Env, loadEnv } from './env.js';
import { DB, ENV, REDIS } from './tokens.js';

/**
 * Global infrastructure: validated env, the Postgres (Drizzle) handle and a shared
 * Redis/Valkey connection. Inject with `@Inject(DB) db: DbHandle`, etc.
 */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: DB,
      inject: [ENV],
      useFactory: (env: Env): DbHandle => createDb(env.DATABASE_URL),
    },
    {
      provide: REDIS,
      inject: [ENV],
      // maxRetriesPerRequest: null is required for connections BullMQ workers reuse.
      useFactory: (env: Env) =>
        new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false }),
    },
  ],
  exports: [ENV, DB, REDIS],
})
export class InfraModule implements OnApplicationShutdown {
  constructor(
    @Inject(DB) private readonly db: DbHandle,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.db.close(), this.redis.quit()]);
  }
}
