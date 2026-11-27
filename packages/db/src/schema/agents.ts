import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/*
 * Outside agents (n8n, Hermes, Claude, scripts) acting for a user.
 *
 * - agent_keys: API keys a user created in Settings → Connections. Only a SHA-256 hash of each
 *   key is stored; the key itself is shown once. `prefix` identifies it in lists.
 */

const ts = () => timestamp({ withTimezone: true });

export const agentKeys = pgTable(
  'agent_keys',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** What the user called it ("Hermes", "n8n"). Actions show as `agent:<name>`. */
    name: text().notNull(),
    /** The start of the key ("hak_3f9c…"), safe to show. */
    prefix: text().notNull(),
    /** SHA-256 (hex) of the whole key. */
    hash: text().notNull().unique(),
    createdAt: ts().notNull().defaultNow(),
    lastUsedAt: ts(),
    revokedAt: ts(),
  },
  (t) => [index().on(t.userId)],
);
