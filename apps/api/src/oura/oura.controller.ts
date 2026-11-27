import { contract } from '@heroarc/contracts';
import {
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Implement, implement, ORPCError } from '@orpc/nest';
import type { Response } from 'express';
import { HeroarcClientGuard } from '../common/heroarc-client.guard.js';
import type { Env } from '../infra/env.js';
import { ENV } from '../infra/tokens.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { OuraNotConnected, OuraService } from './oura.service.js';
import { OuraAuthError } from './oura-api.js';

/** Settings → Oura, onboarding's Connect step, and the Refresh button. */
@Controller()
@UseGuards(HeroarcClientGuard)
export class OuraController {
  private readonly log = new Logger('Oura');

  constructor(
    private readonly oura: OuraService,
    private readonly current: CurrentUserService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The person themselves, in the app (never an agent). */
  private userId(): string {
    if (this.current.agent()) throw new ORPCError('FORBIDDEN');
    return this.current.userId();
  }

  @Implement(contract.oura.status)
  status() {
    return implement(contract.oura.status).handler(() => this.oura.status(this.userId()));
  }

  @Implement(contract.oura.connect)
  connect() {
    return implement(contract.oura.connect).handler(async ({ input }) => {
      if (!this.oura.available)
        throw new ORPCError('NOT_FOUND', { message: 'Oura is not set up.' });
      return { url: await this.oura.connectUrl(this.userId(), input.returnTo) };
    });
  }

  @Implement(contract.oura.sync)
  sync() {
    return implement(contract.oura.sync).handler(async () => {
      const userId = this.userId();
      let days = 0;
      try {
        days = (await this.oura.sync(userId)).days;
      } catch (e) {
        if (e instanceof OuraNotConnected)
          throw new ORPCError('NOT_FOUND', { message: 'Oura is not connected.' });
        // The status says what went wrong (reconnect / error).
      }
      return { ...(await this.oura.status(userId)), days };
    });
  }

  @Implement(contract.oura.disconnect)
  disconnect() {
    return implement(contract.oura.disconnect).handler(async () => {
      await this.oura.disconnect(this.userId());
      return { ok: true as const };
    });
  }

  /** Oura sends the browser back here (through the app origin, so the session is known). */
  @Get('api/v1/oura/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const userId = this.userId();
    const returnTo = (state && (await this.oura.stateReturnTo(state))) || 'settings';
    const back = (result: string) =>
      res.redirect(
        302,
        `${this.env.APP_URL.replace(/\/$/, '')}${returnTo === 'onboarding' ? '/onboarding?step=connect&' : '/?'}oura=${result}`,
      );
    if (error || !code || !state) return back(error === 'access_denied' ? 'cancelled' : 'error');
    try {
      await this.oura.finishConnect(userId, code, state);
    } catch (e) {
      this.log.warn(`connect failed: ${(e as Error).message}`);
      return back(e instanceof OuraAuthError ? 'expired' : 'error');
    }
    // Fetch history in the background; the app shows "Syncing…" until lastSyncAt is set.
    void this.oura
      .sync(userId)
      .catch((e) => this.log.warn(`first sync failed: ${(e as Error).message}`));
    return back('connected');
  }

  /** The scripted Oura's consent page (OURA_CLIENT_ID=fake only): approves at once. */
  @Get('api/v1/oura/fake-authorize')
  fakeAuthorize(@Query('state') state: string | undefined, @Res() res: Response) {
    if (this.env.OURA_CLIENT_ID !== 'fake') throw new NotFoundException();
    const u = new URL(this.oura.redirectUri());
    u.searchParams.set('code', 'fake-code');
    u.searchParams.set('state', state ?? '');
    return res.redirect(302, u.toString());
  }
}
