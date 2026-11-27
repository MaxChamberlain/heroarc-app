import { apiOrigin } from '../lib/api-origin';

// Hop-by-hop headers must not be forwarded by a proxy (RFC 9110 §7.6.1),
// plus host/length which fetch recomputes for the upstream request.
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
];

/**
 * Forwards a request to the API unchanged (same path + query), streaming bodies
 * both ways. Keeps the browser on one origin, so auth cookies are first-party
 * everywhere (prod, previews, localhost) and no CORS is needed.
 */
export async function proxyToApi(
  request: Request,
  origin: string = apiOrigin(),
): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''));
  // Node's fetch always sends `sec-fetch-mode: cors`, so pass the browser's own value on: the
  // API (Better Auth) answers a page visit with a redirect and a script's fetch with JSON.
  headers.set('x-forwarded-sec-fetch-mode', request.headers.get('sec-fetch-mode') ?? '');

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half'; // required by Node's fetch to stream a request body
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json({ error: 'api_unreachable' }, { status: 502 });
  }

  const responseHeaders = new Headers(upstream.headers);
  // fetch already decoded the body, so these would now be wrong.
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
