import { contract } from '@heroarc/contracts';
import { Controller, Get, Inject } from '@nestjs/common';
import { Implement, implement, ORPCError } from '@orpc/nest';
import type { Env } from '../infra/env.js';
import { ENV } from '../infra/tokens.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { type AgentContext, AgentService } from './agent.service.js';
import { openApiDocument } from './openapi.js';
import { externalTools, inputSchema, isExternalTool } from './tools.js';

/** Read results are JSON text for the model; agents get the data itself. */
const parsed = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

/**
 * The agent REST API: outside agents call the tools with an API key (AgentAuthMiddleware).
 * Changes come back as pending receipts the user approves in HeroArc.
 */
@Controller()
export class AgentApiController {
  constructor(
    private readonly agent: AgentService,
    private readonly current: CurrentUserService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private ctx(): AgentContext {
    const a = this.current.agent();
    if (!a) throw new ORPCError('UNAUTHORIZED');
    return {
      userId: this.current.userId(),
      timeZone: this.current.timeZone(),
      actor: a.actor,
      connectionId: a.connectionId,
    };
  }

  @Implement(contract.agent.tools)
  tools() {
    return implement(contract.agent.tools).handler(() => {
      this.ctx();
      return {
        tools: externalTools().map((t) => ({
          name: t.name,
          kind: t.kind as 'read' | 'log' | 'change',
          description: t.description,
          input_schema: inputSchema(t),
        })),
      };
    });
  }

  @Implement(contract.agent.call)
  call() {
    return implement(contract.agent.call).handler(async ({ input }) => {
      const ctx = this.ctx();
      const name = input.params.name;
      if (!isExternalTool(name))
        throw new ORPCError('NOT_FOUND', {
          message: `No tool named ${name}. GET /api/agent/v1/tools lists them.`,
        });
      const out = await this.agent.run(ctx, name, input.body ?? {});
      if (out.isError) throw new ORPCError('BAD_REQUEST', { message: out.result });
      const pending = out.receipt?.status === 'pending';
      return {
        ok: true,
        result: pending
          ? `Waiting for the user to approve in HeroArc: ${out.receipt?.summary}`
          : parsed(out.result),
        ...(out.receipt && { receipt: out.receipt }),
      };
    });
  }

  @Get('api/agent/v1/openapi.json')
  openapi() {
    return openApiDocument(this.env.API_URL);
  }
}
