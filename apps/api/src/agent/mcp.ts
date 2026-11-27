import { createMcpHandler, type McpHttpHandler, Server } from '@modelcontextprotocol/server';
import type { AgentContext, AgentService } from './agent.service.js';
import { externalTools, inputSchema, isExternalTool } from './tools.js';

/** What a connected model reads about HeroArc before using the tools. */
export const MCP_INSTRUCTIONS = [
  "HeroArc is the user's personal health dashboard: meals, weigh-ins, mood, habits and training, with daily goals.",
  'Log new entries freely (they apply at once and the user can undo them in HeroArc). Edits, deletes and changes to goals, habits, the training plan or the dashboard are only proposals: the user approves them in HeroArc (Settings → Agent activity), so never say they are done.',
  "Find a record id with get_day before editing or deleting it. Dates are YYYY-MM-DD in the user's timezone.",
  "Wearable data from Oura (sleep, readiness, HRV, steps, calories burned) isn't available here; the user sees it on their dashboard.",
].join('\n');

/** A short label for a tool name: "log_meal" → "Log meal". */
const titleOf = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');

/**
 * An MCP server over the agent tools for one user (outside agents' tools: no app actions, no
 * Coach notes), made per request with that request's user and connection.
 */
export function heroarcMcpServer(agent: AgentService, ctx: AgentContext, version: string): Server {
  const server = new Server(
    { name: 'heroarc', title: 'HeroArc', version },
    { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
  );

  server.setRequestHandler('tools/list', async () => ({
    tools: externalTools().map((t) => ({
      name: t.name,
      title: titleOf(t.name),
      description: t.description,
      inputSchema: inputSchema(t),
      annotations: {
        title: titleOf(t.name),
        readOnlyHint: t.kind === 'read',
        // Changes can edit or delete the user's records once they approve them.
        destructiveHint: t.kind === 'change',
        idempotentHint: t.kind === 'read',
        openWorldHint: false,
      },
    })),
  }));

  server.setRequestHandler('tools/call', async (req) => {
    const { name } = req.params;
    if (!isExternalTool(name))
      return { content: [{ type: 'text' as const, text: `Unknown tool ${name}.` }], isError: true };
    const out = await agent.run(ctx, name, req.params.arguments ?? {});
    const text =
      out.receipt?.status === 'pending'
        ? `Proposed, not applied yet: ${out.receipt.summary}. The user approves or declines it in HeroArc (Settings → Agent activity); don't say it's done.`
        : out.result;
    return { content: [{ type: 'text' as const, text }], ...(out.isError && { isError: true }) };
  });

  return server;
}

/** Where the request's user travels from our auth to the server factory. */
export const AGENT_CONTEXT = 'heroarc.agentContext';

/**
 * The /mcp handler: MCP 2026-07-28 (stateless, per-request) and, for older clients, 2025-era
 * requests through the SDK's stateless fallback. Auth happens before it (AgentAuthMiddleware);
 * the user arrives as `authInfo.extra[AGENT_CONTEXT]`.
 */
export function heroarcMcpHandler(agent: AgentService, version: string): McpHttpHandler {
  return createMcpHandler(({ authInfo }) => {
    const ctx = authInfo?.extra?.[AGENT_CONTEXT] as AgentContext | undefined;
    if (!ctx) throw new Error('MCP request without a signed-in agent');
    return heroarcMcpServer(agent, ctx, version);
  });
}
