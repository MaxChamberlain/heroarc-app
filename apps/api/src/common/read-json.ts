import type { Request } from 'express';

/** A request body we can't use; the message says why. */
export class BadBody extends Error {}

/**
 * The JSON body, read by hand (the app runs without a body parser: oRPC, Better Auth and MCP
 * each read their own). Must be an object.
 */
export async function readJson(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > maxBytes) throw new BadBody('body too large');
    chunks.push(c as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  let b: unknown;
  try {
    b = raw ? JSON.parse(raw) : {};
  } catch {
    throw new BadBody('body must be JSON');
  }
  if (!b || typeof b !== 'object' || Array.isArray(b))
    throw new BadBody('body must be a JSON object');
  return b as Record<string, unknown>;
}
