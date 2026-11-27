import { oc } from '@orpc/contract';
import { z } from 'zod';
import { THEME_IDS } from './coach.js';

/*
 * Accounts beyond sign-in itself (Better Auth serves /api/auth/*): the signed-in user's profile,
 * which sign-in methods exist, and invites (sign-up is invite-only).
 */

export const Me = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string().nullable(),
  role: z.enum(['admin', 'member']),
  /** IANA timezone; "today" is computed in it. */
  timezone: z.string(),
  /** False until onboarding is finished. */
  onboarded: z.boolean(),
  /** The theme the account chose (null: the default); applied on every device. */
  theme: z.enum(THEME_IDS).nullable(),
});
export type Me = z.infer<typeof Me>;

export const Invite = z.object({
  code: z.string(),
  url: z.string(),
  email: z.string().nullable(),
  role: z.enum(['admin', 'member']),
  expiresAt: z.string(),
  usedAt: z.string().nullable(),
});
export type Invite = z.infer<typeof Invite>;

const isZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const accountContract = {
  authOptions: oc
    .route({
      method: 'GET',
      path: '/api/v1/auth-options',
      summary: 'Which sign-in methods are available.',
      tags: ['account'],
    })
    .output(z.object({ google: z.boolean() })),
  me: oc
    .route({ method: 'GET', path: '/api/v1/me', summary: 'The signed-in user.', tags: ['account'] })
    .output(Me),
  updateMe: oc
    .route({
      method: 'PATCH',
      path: '/api/v1/me',
      summary: 'Update name, timezone, theme, onboarding.',
      tags: ['account'],
    })
    .input(
      z.object({
        name: z.string().trim().min(1).max(60).optional(),
        timezone: z.string().max(64).refine(isZone, 'Unknown timezone').optional(),
        onboarded: z.boolean().optional(),
        theme: z.enum(THEME_IDS).optional(),
      }),
    )
    .output(Me),
  checkInvite: oc
    .route({
      method: 'GET',
      path: '/api/v1/invites/{code}',
      summary: 'Is this invite usable? (public)',
      tags: ['account'],
    })
    .input(z.object({ code: z.string().min(8).max(64) }))
    .output(z.object({ valid: z.boolean(), email: z.string().nullable() })),
  invites: oc
    .route({
      method: 'GET',
      path: '/api/v1/invites',
      summary: 'Invites (admins).',
      tags: ['account'],
    })
    .output(z.array(Invite)),
  createInvite: oc
    .route({
      method: 'POST',
      path: '/api/v1/invites',
      summary: 'Create an invite (admins); emails it if an address is given.',
      tags: ['account'],
    })
    .input(
      z.object({
        email: z.string().email().optional(),
        role: z.enum(['admin', 'member']).default('member'),
      }),
    )
    .output(Invite),
  revokeInvite: oc
    .route({
      method: 'DELETE',
      path: '/api/v1/invites/{code}',
      summary: 'Delete an unused invite (admins).',
      tags: ['account'],
    })
    .input(z.object({ code: z.string().min(8).max(64) }))
    .output(z.object({ ok: z.literal(true) })),
};
