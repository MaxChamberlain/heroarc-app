import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import {
  Controller,
  Delete,
  Get,
  Inject,
  type OnModuleDestroy,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Env } from '../infra/env.js';
import { ENV } from '../infra/tokens.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { AgentService } from './agent.service.js';
import { AGENT_CONTEXT, heroarcMcpHandler } from './mcp.js';

const rpcError = (code: number, message: string) => ({
  jsonrpc: '2.0',
  error: { code, message },
  id: null,
});

/** The Express request as a web Request (the MCP handler is fetch-shaped). */
function toWebRequest(req: Request): globalThis.Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers))
    if (v != null) for (const one of Array.isArray(v) ? v : [v]) headers.append(k, one);
  const url = `${req.protocol}://${req.get('host') ?? 'localhost'}${req.originalUrl}`;
  return new globalThis.Request(url, {
    method: req.method,
    headers,
    body: Readable.toWeb(req) as unknown as ReadableStream,
    duplex: 'half',
  } as RequestInit);
}

/** Send a web Response through Express (JSON, or an SSE stream). */
async function sendWebResponse(res: Response, r: globalThis.Response): Promise<void> {
  res.status(r.status);
  r.headers.forEach((v, k) => {
    res.setHeader(k, v);
  });
  if (!r.body) {
    res.end();
    return;
  }
  await new Promise<void>((done, fail) => {
    Readable.fromWeb(r.body as unknown as NodeReadableStream)
      .on('error', fail)
      .pipe(res)
      .on('finish', done)
      .on('close', done);
  });
}

/**
 * MCP at /mcp for n8n, Hermes, Claude, ChatGPT and other MCP clients. AgentAuthMiddleware has
 * already checked the API key or OAuth token and set the user.
 */
@Controller()
export class McpController implements OnModuleDestroy {
  private readonly handler;

  constructor(
    agent: AgentService,
    private readonly current: CurrentUserService,
    @Inject(ENV) env: Env,
  ) {
    this.handler = heroarcMcpHandler(agent, env.version);
  }

  async onModuleDestroy() {
    await this.handler.close();
  }

  @Post('mcp')
  async post(@Req() req: Request, @Res() res: Response) {
    const a = this.current.agent();
    if (!a) {
      res.status(401).json(rpcError(-32001, 'Unauthorized'));
      return;
    }
    const ctx = {
      userId: this.current.userId(),
      timeZone: this.current.timeZone(),
      actor: a.actor,
      connectionId: a.connectionId,
    };
    const r = await this.handler.fetch(toWebRequest(req), {
      authInfo: {
        token: '',
        clientId: a.connectionId,
        scopes: [],
        extra: { [AGENT_CONTEXT]: ctx },
      },
    });
    await sendWebResponse(res, r);
  }

  /** Stateless: no server-sent stream to open and no session to end. */
  @Get('mcp')
  get(@Res() res: Response) {
    res.setHeader('Allow', 'POST');
    res.status(405).json(rpcError(-32000, 'Method not allowed: use POST.'));
  }

  @Delete('mcp')
  remove(@Res() res: Response) {
    this.get(res);
  }
}
