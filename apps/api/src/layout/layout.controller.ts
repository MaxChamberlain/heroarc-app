import { contract } from '@heroarc/contracts';
import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { HeroarcClientGuard } from '../common/heroarc-client.guard.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { LayoutService } from './layout.service.js';

@Controller()
@UseGuards(HeroarcClientGuard)
export class LayoutController {
  constructor(
    private readonly layouts: LayoutService,
    private readonly user: CurrentUserService,
  ) {}

  @Implement(contract.layout.get)
  get() {
    return implement(contract.layout.get).handler(() => this.layouts.get(this.user.userId()));
  }

  @Implement(contract.layout.save)
  save() {
    return implement(contract.layout.save).handler(({ input }) =>
      this.layouts.save(this.user.userId(), input),
    );
  }
}
