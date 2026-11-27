import type { Layout } from '@heroarc/contracts';
import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Each user's dashboard board layout (see @heroarc/contracts layout.ts). One row per user. */
export const userLayouts = pgTable('user_layouts', {
  userId: text().primaryKey(),
  layout: jsonb().$type<Layout>().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
