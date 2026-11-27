import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { proxyToApi } from './proxy';

interface Seen {
  method?: string;
  url?: string;
  headers?: IncomingMessage['headers'];
  body?: string;
}

let server: Server;
let origin: string;
let seen: Seen = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      seen = { method: req.method, url: req.url, headers: req.headers, body };
      if (req.url?.startsWith('/api/redirect')) {
        res.writeHead(302, { location: '/elsewhere' }).end();
        return;
      }
      res.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/']);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ echoed: body }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('proxyToApi', () => {
  it('forwards method, path, query, headers and body', async () => {
    const request = new Request('https://app.example.com/api/v1/things?x=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'session=abc' },
      body: JSON.stringify({ hello: 'world' }),
    });
    const response = await proxyToApi(request, origin);

    expect(seen.method).toBe('POST');
    expect(seen.url).toBe('/api/v1/things?x=1');
    expect(seen.headers?.cookie).toBe('session=abc');
    expect(seen.headers?.['x-forwarded-host']).toBe('app.example.com');
    expect(seen.headers?.['x-forwarded-proto']).toBe('https');
    expect(seen.body).toBe('{"hello":"world"}');

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ echoed: '{"hello":"world"}' });
  });

  it('keeps every Set-Cookie header', async () => {
    const response = await proxyToApi(new Request('https://app.example.com/api/x'), origin);
    expect(response.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });

  it('passes redirects through instead of following them', async () => {
    const response = await proxyToApi(new Request('https://app.example.com/api/redirect'), origin);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/elsewhere');
  });

  it("passes on the browser's fetch mode (Node's fetch always says cors)", async () => {
    await proxyToApi(
      new Request('https://app.example.com/api/auth/oauth2/authorize', {
        headers: { 'sec-fetch-mode': 'navigate' },
      }),
      origin,
    );
    expect(seen.headers?.['x-forwarded-sec-fetch-mode']).toBe('navigate');
    await proxyToApi(new Request('https://app.example.com/api/x'), origin);
    expect(seen.headers?.['x-forwarded-sec-fetch-mode']).toBe('');
  });

  it('returns 502 when the API is unreachable', async () => {
    const response = await proxyToApi(
      new Request('https://app.example.com/api/x'),
      'http://127.0.0.1:1',
    );
    expect(response.status).toBe(502);
  });
});
