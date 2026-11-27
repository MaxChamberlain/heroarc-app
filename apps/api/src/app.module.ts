import { Module } from '@nestjs/common';
import { ORPCModule } from '@orpc/nest';
import { AuthModule } from './auth/auth.module.js';
import { CoachModule } from './coach/coach.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthDataModule } from './health-data/health-data.module.js';
import { ImportModule } from './import/import.module.js';
import { InfraModule } from './infra/infra.module.js';
import { LayoutModule } from './layout/layout.module.js';
import { SystemController } from './system/system.controller.js';

@Module({
  imports: [
    InfraModule,
    ORPCModule.forRoot({}),
    AuthModule,
    HealthDataModule,
    LayoutModule,
    CoachModule,
    ImportModule,
  ],
  controllers: [HealthController, SystemController],
})
export class AppModule {}
