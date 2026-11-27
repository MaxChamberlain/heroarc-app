import { Module } from '@nestjs/common';
import { CurrentUserService } from '../user/current-user.service.js';
import { HealthDataService } from './health-data.service.js';
import { LegacyController } from './legacy.controller.js';

@Module({
  controllers: [LegacyController],
  providers: [HealthDataService, CurrentUserService],
  exports: [HealthDataService],
})
export class HealthDataModule {}
