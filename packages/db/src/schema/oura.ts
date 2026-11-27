import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/*
 * Oura connections: one per user who connected their ring (Settings → Oura). The daily numbers
 * themselves go to daily_metrics (source 'oura'); disconnecting deletes both.
 */

const ts = () => timestamp({ withTimezone: true });

export const ouraConnections = pgTable('oura_connections', {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** Encrypted with BETTER_AUTH_SECRET (better-auth/crypto). Refresh tokens are single-use. */
  accessToken: text().notNull(),
  refreshToken: text().notNull(),
  expiresAt: ts().notNull(),
  /** Scopes the user granted (they can untick some on Oura's consent screen). */
  scopes: text().array().notNull().default([]),
  connectedAt: ts().notNull().defaultNow(),
  lastSyncAt: ts(),
  /** 'ok' · 'reconnect' (Oura refused the tokens: connect again) · 'error' (the last sync failed). */
  status: text().notNull().default('ok'),
  lastError: text(),
  /** The first day fetched so far (the first sync backfills history). */
  syncedFrom: text(),
});
