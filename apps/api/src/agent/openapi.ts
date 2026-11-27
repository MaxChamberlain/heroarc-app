import { externalTools, inputSchema } from './tools.js';

/**
 * OpenAPI 3.1 for the agent API, built from the tool registry: one operation per tool (its
 * input as the request body), so n8n HTTP nodes, GPT actions and scripts can import it.
 * Served at GET /api/agent/v1/openapi.json.
 */
export function openApiDocument(apiUrl: string) {
  const tools = externalTools();
  const json = (schema: unknown) => ({ 'application/json': { schema } });
  const err = (description: string) => ({
    description,
    content: json({ type: 'object', properties: { message: { type: 'string' } } }),
  });
  return {
    openapi: '3.1.0',
    info: {
      title: 'HeroArc agent API',
      version: '1',
      description:
        "Log meals, weigh-ins, moods, habits and training for a HeroArc user, read their history, and propose changes. Authenticate with `Authorization: Bearer <API key>` (HeroArc → Settings → Connections). New entries apply at once and can be undone in the app; edits, deletes, goals, habits, the plan and the dashboard are proposals the user approves in HeroArc. Wearable (Oura) data isn't available. Limit: 120 requests a minute per key.",
    },
    servers: [{ url: apiUrl.replace(/\/$/, '') }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', description: 'A HeroArc API key (hak_…).' },
      },
      schemas: {
        Result: {
          type: 'object',
          required: ['ok', 'result'],
          properties: {
            ok: { type: 'boolean' },
            result: { description: 'Data for reads; a sentence for writes.' },
            receipt: {
              type: 'object',
              description:
                'For writes: applied (undoable in the app) or pending (waiting for the user to approve).',
              properties: {
                actionId: { type: 'string' },
                tool: { type: 'string' },
                summary: { type: 'string' },
                status: { type: 'string', enum: ['applied', 'pending', 'undone', 'cancelled'] },
              },
            },
          },
        },
      },
    },
    paths: {
      '/api/agent/v1/tools': {
        get: {
          operationId: 'list_tools',
          summary: 'The tools, with input schemas.',
          responses: {
            '200': { description: 'Tools', content: json({ type: 'object' }) },
            '401': err('No or bad key'),
          },
        },
      },
      ...Object.fromEntries(
        tools.map((t) => [
          `/api/agent/v1/tools/${t.name}`,
          {
            post: {
              operationId: t.name,
              summary: `${t.kind === 'read' ? 'Read' : t.kind === 'log' ? 'Log' : 'Propose'}: ${t.name.replace(/_/g, ' ')}`,
              description: t.description,
              requestBody: { required: true, content: json(inputSchema(t)) },
              responses: {
                '200': {
                  description: 'Done',
                  content: json({ $ref: '#/components/schemas/Result' }),
                },
                '400': err('The input was invalid; the message says why'),
                '401': err('No or bad key'),
                '429': err('Too many requests'),
              },
            },
          },
        ]),
      ),
    },
  };
}
