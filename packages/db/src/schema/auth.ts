import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/*
 * Sign-in (Better Auth). The first four tables follow Better Auth's core schema (with the
 * username plugin's two columns); don't rename them. user_profiles and invites are ours.
 */

const ts = () => timestamp({ withTimezone: true });

export const user = pgTable('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
  username: text().unique(),
  displayUsername: text(),
});

export const session = pgTable(
  'session',
  {
    id: text().primaryKey(),
    expiresAt: ts().notNull(),
    token: text().notNull().unique(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index().on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts(),
    refreshTokenExpiresAt: ts(),
    scope: text(),
    password: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull(),
  },
  (t) => [index().on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: ts().notNull(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.identifier)],
);

/** HeroArc's own per-user settings. Created with the account. */
export const userProfiles = pgTable('user_profiles', {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** 'admin' (can invite people) or 'member'. */
  role: text().notNull().default('member'),
  /** IANA zone for "today", set during onboarding. */
  timezone: text().notNull().default('America/Denver'),
  /** False until the user finishes onboarding. */
  onboarded: boolean().notNull().default(false),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

/** Sign-up is invite-only: each new account needs an unused, unexpired invite. */
export const invites = pgTable('invites', {
  code: text().primaryKey(),
  /** If set, only this email can use the invite. */
  email: text(),
  /** Role the new account gets. */
  role: text().notNull().default('member'),
  /** User id of whoever created it ('system' for the setup script). */
  createdBy: text().notNull(),
  expiresAt: ts().notNull(),
  usedBy: text(),
  usedAt: ts(),
  createdAt: ts().notNull().defaultNow(),
});
