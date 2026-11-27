import { Module } from '@nestjs/common';
import { CurrentUserService } from '../user/current-user.service.js';
import { LayoutController } from './layout.controller.js';
import { LayoutService } from './layout.service.js';

@Module({
  controllers: [LayoutController],
  providers: [LayoutService, CurrentUserService],
  exports: [LayoutService],
})
export class LayoutModule {}
