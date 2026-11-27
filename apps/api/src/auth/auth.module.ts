import { type DbHandle } from '@heroarc/db';
import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { Env } from '../infra/env.js';
import { DB, ENV } from '../infra/tokens.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { AccountController } from './account.controller.js';
import { AgentAuthMiddleware } from './agent-auth.middleware.js';
import { AgentKeysService } from './agent-keys.js';
import { createAuth } from './auth.js';
import { ConnectionsController } from './connections.controller.js';
import { type Mailer, ResendMailer, SmtpMailer } from './mailer.js';
import { OAuthTokenVerifier } from './oauth-tokens.js';
import { SessionMiddleware } from './session.middleware.js';
import { SigningKeysCheck } from './signing-keys.js';
import { AUTH, MAILER } from './tokens.js';

/** Sign-in (Better Auth), email, sessions and agent keys → current user, account and connection routes. */
@Global()
@Module({
  controllers: [AccountController, ConnectionsController],
  providers: [
    {
      provide: MAILER,
      inject: [ENV],
      useFactory: (env: Env): Mailer =>
        env.RESEND_API_KEY
          ? new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM)
          : new SmtpMailer(env.SMTP_URL, env.MAIL_FROM),
    },
    {
      provide: AUTH,
      inject: [ENV, DB, MAILER],
      useFactory: (env: Env, dbh: DbHandle, mailer: Mailer) => createAuth(env, dbh, mailer),
    },
    CurrentUserService,
    AgentKeysService,
    OAuthTokenVerifier,
    SigningKeysCheck,
    SessionMiddleware,
    AgentAuthMiddleware,
  ],
  exports: [AUTH, MAILER, CurrentUserService, AgentKeysService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Each one ignores the other's paths: sessions for the app, API keys for agent paths.
    consumer.apply(SessionMiddleware, AgentAuthMiddleware).forRoutes('*');
  }
}
