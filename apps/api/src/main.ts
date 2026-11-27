import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module.js';
import type { Auth } from './auth/auth.js';
import { AUTH } from './auth/tokens.js';
import { assertApiEnv, loadEnv } from './infra/env.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  assertApiEnv(env);
  // bodyParser off: oRPC (and later Better Auth / MCP) parse their own request bodies.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Requests arrive through Render's proxy and the web app's /api proxy.
  app.set('trust proxy', true);
  // Sign-in (Better Auth) handles its own routes, ahead of Nest's.
  const auth = app.get<Auth>(AUTH);
  const http = app.getHttpAdapter().getInstance();
  const betterAuth = toNodeHandler(auth);
  const handleAuth = (req: IncomingMessage, res: ServerResponse) => {
    // Behind the web app's proxy, the browser's fetch mode arrives in x-forwarded-sec-fetch-mode
    // (Node's fetch overwrites sec-fetch-mode). Better Auth uses it to choose redirect or JSON.
    const mode = req.headers['x-forwarded-sec-fetch-mode'];
    if (typeof mode === 'string') {
      if (mode) req.headers['sec-fetch-mode'] = mode;
      else delete req.headers['sec-fetch-mode'];
    }
    return betterAuth(req, res);
  };
  http.all('/api/auth/*splat', handleAuth);
  // OAuth discovery for MCP clients: protected resource metadata (this origin) and the
  // authorization server's metadata (the app origin forwards /.well-known/* here).
  http.get('/.well-known/*splat', handleAuth);
  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  console.log(`heroarc-api ${env.version} listening on :${env.PORT}`);
}

void bootstrap();
