import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Small key/value table for app-level state that isn't per-user
 * (e.g. one-off import markers, feature switches).
 */
export const appMeta = pgTable('app_meta', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
