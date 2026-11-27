import { Module } from '@nestjs/common';
import { InfraModule } from '../infra/infra.module.js';
import { OuraCoreModule } from '../oura/oura-core.module.js';
import { OuraQueueService } from './oura-queue.service.js';
import { SystemQueueService } from './system-queue.service.js';

@Module({
  imports: [InfraModule, OuraCoreModule],
  providers: [SystemQueueService, OuraQueueService],
})
export class WorkerModule {}
