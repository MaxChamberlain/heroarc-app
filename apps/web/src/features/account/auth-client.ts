import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Sign-in (Better Auth) on our own origin: /api/auth/* is proxied to the API. The OAuth client
 * plugin carries an app's sign-in request (Claude, ChatGPT…) through sign-in and consent.
 */
export const authClient = createAuthClient({ plugins: [usernameClient(), oauthProviderClient()] });

/** True while signing in on behalf of an app's OAuth request (the page URL carries it, signed). */
export const inOAuthFlow = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sig');

/** The invite code travels in this cookie from /invite/{code} to sign-up (any method). */
export const INVITE_COOKIE = 'heroarc_invite';

export function setInviteCookie(code: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: a short-lived first-party cookie the server reads at sign-up.
  document.cookie = `${INVITE_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${60 * 60 * 24}; SameSite=Lax`;
}

export function inviteCookie(): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${INVITE_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1] as string) : undefined;
}

/** A Better Auth error as a sentence. */
export function authError(
  e: { message?: string; code?: string } | null | undefined,
  fallback: string,
): string {
  return e?.message || fallback;
}
