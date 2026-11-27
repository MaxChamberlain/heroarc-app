import { Module } from '@nestjs/common';
import { InfraModule } from '../infra/infra.module.js';
import { SystemQueueService } from './system-queue.service.js';

@Module({
  imports: [InfraModule],
  providers: [SystemQueueService],
})
export class WorkerModule {}
