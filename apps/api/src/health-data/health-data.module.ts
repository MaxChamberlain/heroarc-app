import { Module } from '@nestjs/common';
import { OuraCoreModule } from '../oura/oura-core.module.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { HealthDataService } from './health-data.service.js';
import { LegacyController } from './legacy.controller.js';

@Module({
  imports: [OuraCoreModule],
  controllers: [LegacyController],
  providers: [HealthDataService, CurrentUserService],
  exports: [HealthDataService],
})
export class HealthDataModule {}
