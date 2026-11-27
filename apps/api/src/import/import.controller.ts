import { contract } from '@heroarc/contracts';
import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { HeroarcClientGuard, MaxBody } from '../common/heroarc-client.guard.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { ImportError, LegacyImportService } from './legacy-import.service.js';

const fail = (e: unknown): never => {
  if (e instanceof ImportError) throw new ORPCError('BAD_REQUEST', { message: e.message });
  throw e;
};

/** Settings → Import from the old HeroArc: preview, then import, into the signed-in account. */
@Controller()
@UseGuards(HeroarcClientGuard)
export class ImportController {
  constructor(
    private readonly importer: LegacyImportService,
    private readonly current: CurrentUserService,
  ) {}

  /** The person themselves, in the app (never an agent). */
  private userId(): string {
    if (this.current.agent()) throw new ORPCError('FORBIDDEN');
    return this.current.userId();
  }

  @MaxBody(11 * 1024 * 1024)
  @Implement(contract.import.preview)
  preview() {
    return implement(contract.import.preview).handler(({ input }) =>
      this.importer.preview(this.userId(), input.file).catch(fail),
    );
  }

  @MaxBody(11 * 1024 * 1024)
  @Implement(contract.import.run)
  run() {
    return implement(contract.import.run).handler(({ input }) =>
      this.importer.run(this.userId(), this.current.timeZone(), input.file).catch(fail),
    );
  }
}
