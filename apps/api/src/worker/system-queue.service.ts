import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS } from '../infra/tokens.js';

export const SYSTEM_QUEUE = 'system';

/**
 * Example queue + scheduled job. Pattern for new background work:
 *   1. A Queue (producers add jobs), 2. a Worker (processes them),
 *   3. optional upsertJobScheduler for recurring jobs.
 * Real queues (oura, email, cleanup) follow this shape.
 */
@Injectable()
export class SystemQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemQueueService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    this.queue = new Queue(SYSTEM_QUEUE, { connection: this.redis });
    this.worker = new Worker(
      SYSTEM_QUEUE,
      async (job) => {
        if (job.name === 'heartbeat') {
          this.logger.log(`heartbeat ${new Date().toISOString()}`);
        }
      },
      { connection: this.redis.duplicate() },
    );
    await this.queue.upsertJobScheduler('heartbeat', { every: 5 * 60_000 }, { name: 'heartbeat' });
    this.logger.log('system queue ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
