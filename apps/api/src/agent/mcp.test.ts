import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentService, ToolOutcome } from './agent.service.js';
import { AGENT_CONTEXT, heroarcMcpHandler } from './mcp.js';
import { externalTools } from './tools.js';

const ctx = { userId: 'u1', timeZone: 'UTC', actor: 'agent:n8n', connectionId: 'k1' };
const auth = {
  authInfo: { token: '', clientId: 'k1', scopes: [], extra: { [AGENT_CONTEXT]: ctx } },
};
let handler: ReturnType<typeof heroarcMcpHandler> | undefined;

afterEach(async () => {
  await handler?.close();
});

function serve(run: (name: string, input: unknown) => Promise<ToolOutcome>) {
  const agent = { run: vi.fn((_c: unknown, n: string, i: unknown) => run(n, i)) };
  handler = heroarcMcpHandler(agent as unknown as AgentService, 'test');
  const h = handler;
  const fetch = (url: string | URL, init?: RequestInit) => h.fetch(new Request(url, init), auth);
  return { agent, fetch };
}

/** A 2025-era client: plain JSON-RPC over POST (the reply may come as JSON or one SSE event). */
async function legacy(
  fetch: ReturnType<typeof serve>['fetch'],
  id: number,
  method: string,
  params?: object,
) {
  const r = await fetch('http://mcp.test/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(method !== 'initialize' && { 'mcp-protocol-version': '2025-06-18' }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params && { params }) }),
  });
  const text = await r.text();
  const json = r.headers.get('content-type')?.includes('text/event-stream')
    ? (text
        .split('\n')
        .find((l) => l.startsWith('data:'))
        ?.slice(5) ?? '{}')
    : text;
  return JSON.parse(json);
}

/** A client that speaks only 2026-07-28, so these tests prove the modern path. */
const modernClient = () =>
  new Client(
    { name: 'test', version: '1' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );

const logged: ToolOutcome = {
  result: 'Done: Logged 150.2 lb (today).',
  receipt: {
    actionId: 'a1',
    tool: 'log_weight',
    summary: 'Logged 150.2 lb (today)',
    status: 'applied',
  },
};

describe('MCP (2026-07-28 clients)', () => {
  it('lists the outside-agent tools with hints, and runs them as the connected user', async () => {
    const { agent, fetch } = serve(async () => logged);
    const client = modernClient();
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://mcp.test/mcp'), { fetch }),
    );
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
    expect(client.getInstructions()).toContain('never say they are done');

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(externalTools().map((t) => t.name));
    expect(tools.find((t) => t.name === 'get_day')?.annotations).toMatchObject({
      readOnlyHint: true,
    });
    expect(tools.find((t) => t.name === 'delete_record')?.annotations?.destructiveHint).toBe(true);

    const r = await client.callTool({ name: 'log_weight', arguments: { lb: 150.2 } });
    expect(agent.run).toHaveBeenCalledWith(ctx, 'log_weight', { lb: 150.2 });
    expect(r.content).toEqual([{ type: 'text', text: 'Done: Logged 150.2 lb (today).' }]);
    await client.close();
  });

  it("says a change is only proposed, and refuses tools agents don't get", async () => {
    const { agent, fetch } = serve(async () => ({
      result: 'Proposed…',
      receipt: {
        actionId: 'a2',
        tool: 'set_goals',
        summary: 'Set goals: 2,000 kcal',
        status: 'pending',
      },
    }));
    const client = modernClient();
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://mcp.test/mcp'), { fetch }),
    );
    const r = await client.callTool({ name: 'set_goals', arguments: { kcal: 2000 } });
    expect((r.content as Array<{ text: string }>)[0]?.text).toContain(
      'not applied yet: Set goals: 2,000 kcal',
    );
    for (const name of ['set_theme', 'remember', 'nope']) {
      const x = await client.callTool({ name, arguments: {} });
      expect(x.isError, name).toBe(true);
    }
    expect(agent.run).toHaveBeenCalledTimes(1);
    await client.close();
  });
});

describe('MCP (2025-era clients: n8n, Hermes, older SDKs)', () => {
  it('initialize, tools/list and tools/call work statelessly', async () => {
    const { agent, fetch } = serve(async () => logged);
    const init = await legacy(fetch, 1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'n8n', version: '1' },
    });
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.serverInfo.name).toBe('heroarc');
    const list = await legacy(fetch, 2, 'tools/list');
    expect(list.result.tools.length).toBe(externalTools().length);
    const call = await legacy(fetch, 3, 'tools/call', {
      name: 'log_weight',
      arguments: { lb: 150.2 },
    });
    expect(call.result.content[0].text).toContain('Logged 150.2 lb');
    expect(agent.run).toHaveBeenCalledWith(ctx, 'log_weight', { lb: 150.2 });
  });
});
