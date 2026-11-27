import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { and, type DbHandle, eq, gt, isNull, schema } from '@heroarc/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { jwt, username } from 'better-auth/plugins';
import { authSecret, type Env } from '../infra/env.js';
import { email, type Mailer } from './mailer.js';

const {
  account,
  invites,
  jwks,
  oauthAccessToken,
  oauthClient,
  oauthClientAssertion,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  session,
  user,
  userProfiles,
  verification,
} = schema;

/** The MCP server's resource identifier: tokens for MCP clients are bound to it. */
export const mcpResource = (env: Env) => `${env.API_URL.replace(/\/$/, '')}/mcp`;

/** The invite code travels in this cookie from /invite/{code} to sign-up (any method). */
export const INVITE_COOKIE = 'heroarc_invite';

function inviteCode(headers: Headers | undefined): string | undefined {
  const cookie = headers?.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${INVITE_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1] as string) : undefined;
}

/** An unused, unexpired invite that fits this email, or undefined. */
export async function findInvite(db: DbHandle['db'], code: string | undefined, forEmail?: string) {
  if (!code) return undefined;
  const [inv] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.code, code), isNull(invites.usedAt), gt(invites.expiresAt, new Date())));
  if (!inv) return undefined;
  if (inv.email && forEmail && inv.email.toLowerCase() !== forEmail.toLowerCase()) return undefined;
  return inv;
}

/**
 * Better Auth: email + password (verified email required), username sign-in, optional Google.
 * Sign-up is invite-only on every path: a new user needs a valid invite (see invites table).
 * Mounted at /api/auth/* (main.ts); the web app proxies that path, so cookies are first-party.
 */
export function createAuth(env: Env, dbh: DbHandle, mailer: Mailer) {
  const secret = authSecret(env);
  return betterAuth({
    appName: 'HeroArc',
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    secret,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(dbh.db, {
      provider: 'pg',
      schema: {
        user,
        session,
        account,
        verification,
        jwks,
        oauthClient,
        oauthResource,
        oauthClientResource,
        oauthRefreshToken,
        oauthAccessToken,
        oauthConsent,
        oauthClientAssertion,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      sendResetPassword: async ({ user: u, url }) => {
        const m = email(
          'Reset your HeroArc password',
          ['Someone (hopefully you) asked to reset your password.'],
          {
            label: 'Choose a new password',
            url,
          },
        );
        await mailer.send(u.email, 'Reset your HeroArc password', m.text, m.html);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: u, url }) => {
        const m = email(
          'Confirm your email',
          [`Hi ${u.name}, welcome to HeroArc.`, 'Confirm your email to finish setting up.'],
          {
            label: 'Confirm email',
            url,
          },
        );
        await mailer.send(u.email, 'Confirm your HeroArc email', m.text, m.html);
      },
    },
    // Failed sign-ins that end in a redirect (e.g. Google without an invite) land on our page.
    onAPIError: { errorURL: `${env.APP_URL.replace(/\/$/, '')}/sign-in` },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
    // The JWT plugin's own /token (a session JWT) is off: only OAuth access tokens leave here.
    disabledPaths: ['/token'],
    plugins: [
      username(),
      jwt({ disableSettingJwtHeader: true }),
      // OAuth 2.1 for MCP clients that sign in (Claude, ChatGPT connectors…): our sign-in page,
      // a consent page, tokens bound to the MCP resource. API keys remain for everything else.
      mcp({
        loginPage: '/sign-in',
        consentPage: '/connect/consent',
        resource: mcpResource(env),
        // Older MCP clients register themselves; newer ones use Client ID Metadata Documents.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // Loopback redirects (Claude Code, desktop clients) register as native apps; others as web.
        clientRegistrationDefaultApplicationType: 'infer',
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
    ],
    // A clear refusal for email sign-up without a usable invite. (The user.create hook below
    // still guards every path, but Better Auth hides its errors on this endpoint so nobody can
    // probe which emails exist; an invite problem isn't a secret, so say so up front.)
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') return;
        const body = (ctx.body ?? {}) as { email?: string };
        if (!(await findInvite(dbh.db, inviteCode(ctx.headers), body.email)))
          throw new APIError('FORBIDDEN', {
            message: "This invite doesn't work for that email. It may have expired or been used.",
          });
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (u, ctx) => {
            const inv = await findInvite(
              dbh.db,
              inviteCode(ctx?.headers ?? ctx?.request?.headers),
              u.email,
            );
            if (!inv)
              throw new APIError('FORBIDDEN', {
                message: 'HeroArc is invite-only. Use the invite link you were sent.',
              });
            return { data: u };
          },
          after: async (u, ctx) => {
            const inv = await findInvite(
              dbh.db,
              inviteCode(ctx?.headers ?? ctx?.request?.headers),
              u.email,
            );
            await dbh.db
              .insert(userProfiles)
              .values({ userId: u.id, role: inv?.role === 'admin' ? 'admin' : 'member' })
              .onConflictDoNothing();
            if (inv)
              await dbh.db
                .update(invites)
                .set({ usedBy: u.id, usedAt: new Date() })
                .where(eq(invites.code, inv.code));
          },
        },
      },
    },
    advanced: { cookiePrefix: 'heroarc' },
  });
}

export type Auth = ReturnType<typeof createAuth>;
