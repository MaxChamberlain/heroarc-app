import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BadBody, readJson } from '../common/read-json.js';
import { OuraNotConnected, OuraService } from '../oura/oura.service.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { type AgentContext, AgentService } from './agent.service.js';
import { foodInput, HermesInputError, trainingInput, weightInput } from './hermes.js';

const MAX_BODY = 10_000;

/**
 * The original HeroArc API, so Hermes and n8n only need a new URL and key:
 *   GET /today · POST /food · POST /weight · POST /training · POST /sync
 * Auth is AgentAuthMiddleware (Bearer key). Replies keep the original shape: { ok, result } or
 * { ok: false, error }. Wearable (Oura) fields in /today are null: Oura data never goes to agents.
 */
@Controller()
export class HermesController {
  constructor(
    private readonly agent: AgentService,
    private readonly current: CurrentUserService,
    private readonly oura: OuraService,
  ) {}

  private ctx(): AgentContext {
    const a = this.current.agent();
    return {
      userId: this.current.userId(),
      timeZone: this.current.timeZone(),
      actor: a?.actor ?? 'agent',
      ...(a && { connectionId: a.connectionId }),
    };
  }

  private async respond(res: Response, fn: () => Promise<string>) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.status(200).json({ ok: true, result: await fn() });
    } catch (e) {
      if (e instanceof HermesInputError || e instanceof BadBody)
        res.status(400).json({ ok: false, error: e.message });
      else throw e;
    }
  }

  /** Run a log tool; a validation problem comes back as a 400 sentence. */
  private async log(name: 'log_meal' | 'log_weight' | 'log_training', input: unknown) {
    const out = await this.agent.run(this.ctx(), name, input);
    if (out.isError) throw new HermesInputError(out.result);
    return out.receipt?.summary ?? out.result;
  }

  @Get('today')
  async today(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res
      .status(200)
      .json({ ok: true, ...(await this.agent.todayTotals(this.ctx())), lastSync: null });
  }

  @Post('food')
  food(@Req() req: Request, @Res() res: Response) {
    return this.respond(res, async () => {
      const { input, dryRun } = foodInput(await readJson(req, MAX_BODY));
      if (dryRun)
        return `Dry run, nothing logged: ${input.meal}: ${input.items} (${Math.round(input.kcal)} kcal)`;
      return this.log('log_meal', input);
    });
  }

  @Post('weight')
  weight(@Req() req: Request, @Res() res: Response) {
    return this.respond(res, async () =>
      this.log('log_weight', weightInput(await readJson(req, MAX_BODY))),
    );
  }

  @Post('training')
  training(@Req() req: Request, @Res() res: Response) {
    return this.respond(res, async () => {
      const b = await readJson(req, MAX_BODY);
      const ctx = this.ctx();
      const date =
        typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : undefined;
      const day = await this.agent.getDay(ctx, date ?? this.agent.todayFor(ctx));
      return this.log(
        'log_training',
        trainingInput(
          b,
          day.training.find((t) => t.current),
        ),
      );
    });
  }

  @Post('sync')
  async sync(@Res() res: Response) {
    // Only a count comes back: Oura data never goes to agents.
    try {
      const r = await this.oura.sync(this.current.userId());
      res.status(200).json({ ok: true, result: `Synced ${r.days} days from Oura.` });
    } catch (e) {
      res.status(e instanceof OuraNotConnected ? 409 : 502).json({
        ok: false,
        error:
          e instanceof OuraNotConnected
            ? 'Oura is not connected for this account (HeroArc → Settings → Oura).'
            : 'Oura sync failed; HeroArc retries on its own every 30 minutes.',
      });
    }
  }
}
