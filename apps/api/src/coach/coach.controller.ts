import { contract } from '@heroarc/contracts';
import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { ActionError, type ActionOutcome, AgentService } from '../agent/agent.service.js';
import { HeroarcClientGuard, MaxBody } from '../common/heroarc-client.guard.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { CoachError, CoachService } from './coach.service.js';

const VERB = { confirm: 'applied', cancel: 'cancelled', undo: 'undid' } as const;

@Controller()
@UseGuards(HeroarcClientGuard)
export class CoachController {
  constructor(
    private readonly coach: CoachService,
    private readonly agent: AgentService,
    private readonly user: CurrentUserService,
  ) {}

  private ctx() {
    return { userId: this.user.userId(), timeZone: this.user.timeZone(), actor: 'coach' };
  }

  private static fail(e: unknown): never {
    if (e instanceof CoachError || (e instanceof ActionError && e.code === 'not_found'))
      throw new ORPCError('NOT_FOUND', { message: e.message });
    if (e instanceof ActionError) throw new ORPCError('CONFLICT', { message: e.message });
    throw e;
  }

  @Implement(contract.coach.status)
  status() {
    return implement(contract.coach.status).handler(() => this.coach.status());
  }

  // Up to four photos (5 MB each) and a voice note (10 MB), as the contract allows.
  @MaxBody(32 * 1024 * 1024)
  @Implement(contract.coach.send)
  send() {
    const self = this;
    return implement(contract.coach.send).handler(async function* ({ input, signal }) {
      yield* self.coach.send(self.ctx(), input, signal);
    });
  }

  @Implement(contract.coach.chats)
  chats() {
    return implement(contract.coach.chats).handler(() => this.coach.chats(this.user.userId()));
  }

  @Implement(contract.coach.chat)
  chat() {
    return implement(contract.coach.chat).handler(({ input }) =>
      this.coach.chat(this.user.userId(), input.id).catch(CoachController.fail),
    );
  }

  @Implement(contract.coach.deleteChat)
  deleteChat() {
    return implement(contract.coach.deleteChat).handler(async ({ input }) => {
      await this.coach.deleteChat(this.user.userId(), input.id);
      return { ok: true as const };
    });
  }

  @Implement(contract.coach.attachment)
  attachment() {
    return implement(contract.coach.attachment).handler(async ({ input }) => {
      const a = await this.coach
        .attachment(this.user.userId(), input.id)
        .catch(CoachController.fail);
      return {
        headers: { 'cache-control': 'private, max-age=31536000, immutable' },
        body: new File([new Uint8Array(a.data)], `${input.id}.jpg`, { type: a.mime }),
      };
    });
  }

  /** Apply / Cancel / Undo, and tell Coach what the user did (it reads that next time). */
  private async settle(kind: keyof typeof VERB, id: string) {
    const ctx = this.ctx();
    const r: ActionOutcome = await this.agent[kind](ctx, id).catch(CoachController.fail);
    await this.coach.note(ctx.userId, r.chatId, `The user ${VERB[kind]}: ${r.receipt.summary}`);
    return { receipt: r.receipt, changed: r.changed };
  }

  @Implement(contract.coach.confirm)
  confirm() {
    return implement(contract.coach.confirm).handler(({ input }) =>
      this.settle('confirm', input.id),
    );
  }

  @Implement(contract.coach.cancel)
  cancel() {
    return implement(contract.coach.cancel).handler(({ input }) => this.settle('cancel', input.id));
  }

  @Implement(contract.coach.undo)
  undo() {
    return implement(contract.coach.undo).handler(({ input }) => this.settle('undo', input.id));
  }

  @Implement(contract.coach.notes)
  notes() {
    return implement(contract.coach.notes).handler(() => this.coach.notes(this.user.userId()));
  }

  @Implement(contract.coach.deleteNote)
  deleteNote() {
    return implement(contract.coach.deleteNote).handler(async ({ input }) => {
      await this.coach.deleteNote(this.user.userId(), input.id);
      return { ok: true as const };
    });
  }
}
