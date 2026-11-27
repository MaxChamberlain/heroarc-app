import { contract } from '@heroarc/contracts';
import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { HeroarcClientGuard } from '../common/heroarc-client.guard.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { ActionError, type AgentContext, AgentService } from './agent.service.js';

/**
 * Settings → Agent activity: the user (never an agent) applies or declines what outside agents
 * proposed, and can undo what they did.
 */
@Controller()
@UseGuards(HeroarcClientGuard)
export class ActivityController {
  constructor(
    private readonly agent: AgentService,
    private readonly current: CurrentUserService,
  ) {}

  private ctx(): AgentContext {
    if (this.current.agent()) throw new ORPCError('FORBIDDEN');
    return { userId: this.current.userId(), timeZone: this.current.timeZone(), actor: 'user' };
  }

  private async settle(kind: 'confirm' | 'cancel' | 'undo', id: string) {
    try {
      const r = await this.agent[kind](this.ctx(), id);
      return { receipt: r.receipt, changed: r.changed };
    } catch (e) {
      if (e instanceof ActionError)
        throw new ORPCError(e.code === 'not_found' ? 'NOT_FOUND' : 'CONFLICT', {
          message: e.message,
        });
      throw e;
    }
  }

  @Implement(contract.activity.list)
  list() {
    return implement(contract.activity.list).handler(() => this.agent.activity(this.ctx().userId));
  }

  @Implement(contract.activity.confirm)
  confirm() {
    return implement(contract.activity.confirm).handler(({ input }) =>
      this.settle('confirm', input.id),
    );
  }

  @Implement(contract.activity.cancel)
  cancel() {
    return implement(contract.activity.cancel).handler(({ input }) =>
      this.settle('cancel', input.id),
    );
  }

  @Implement(contract.activity.undo)
  undo() {
    return implement(contract.activity.undo).handler(({ input }) => this.settle('undo', input.id));
  }
}
