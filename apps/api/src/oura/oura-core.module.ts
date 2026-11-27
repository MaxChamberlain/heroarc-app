import { Module } from '@nestjs/common';
import type { Env } from '../infra/env.js';
import { ENV } from '../infra/tokens.js';
import { FakeOuraApi } from './fake-oura.js';
import { OURA_API, OuraService } from './oura.service.js';
import { HttpOuraApi } from './oura-api.js';

/** OuraService and its Oura client, for the API and the worker. */
@Module({
  providers: [
    OuraService,
    {
      provide: OURA_API,
      inject: [ENV],
      // HeroArc's Oura application; the scripted stand-in when OURA_CLIENT_ID=fake; else off.
      useFactory: (env: Env) =>
        env.OURA_CLIENT_ID === 'fake'
          ? new FakeOuraApi(env.APP_URL)
          : env.OURA_CLIENT_ID && env.OURA_CLIENT_SECRET
            ? new HttpOuraApi(env.OURA_CLIENT_ID, env.OURA_CLIENT_SECRET)
            : null,
    },
  ],
  exports: [OuraService],
})
export class OuraCoreModule {}
