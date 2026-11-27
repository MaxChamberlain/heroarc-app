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
import { OuraService } from '../oura/oura.service.js';

export const OURA_QUEUE = 'oura';
const EVERY_MS = 30 * 60_000;

/** Every 30 minutes, sync the recent days of everyone connected to Oura. */
@Injectable()
export class OuraQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OuraQueueService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly oura: OuraService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.oura.available) {
      this.logger.log('Oura is not set up; no scheduled sync');
      return;
    }
    this.queue = new Queue(OURA_QUEUE, { connection: this.redis });
    this.worker = new Worker(
      OURA_QUEUE,
      async (job) => {
        if (job.name !== 'sync-all') return;
        const r = await this.oura.syncAll();
        if (r.ok || r.failed) this.logger.log(`synced ${r.ok}, failed ${r.failed}`);
      },
      { connection: this.redis.duplicate(), concurrency: 1 },
    );
    await this.queue.upsertJobScheduler('oura-sync-all', { every: EVERY_MS }, { name: 'sync-all' });
    this.logger.log('oura queue ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
