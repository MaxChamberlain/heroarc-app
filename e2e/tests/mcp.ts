import type { APIResponse } from '@playwright/test';

/** An MCP JSON-RPC reply, sent as JSON or as one server-sent event (both are valid MCP). */
export async function rpcBody(r: APIResponse) {
  const text = await r.text();
  if (!(r.headers()['content-type'] ?? '').includes('text/event-stream')) return JSON.parse(text);
  const data = text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .find((l) => l.startsWith('{'));
  return JSON.parse(data ?? '{}');
}
