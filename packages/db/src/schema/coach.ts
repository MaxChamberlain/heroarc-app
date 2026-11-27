import { customType, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/*
 * Coach (the in-app assistant) and the agent action log.
 *
 * - coach_chats / coach_messages: saved conversations. `content` holds the model's content
 *   blocks exactly (they are replayed to the model); `display` is what the app shows.
 * - coach_attachments: photos sent to Coach (shrunk JPEGs), kept with the account.
 * - coach_notes: short facts Coach keeps about the user ("vegetarian"), read in every chat.
 * - agent_actions: every change an agent made or proposed, with what's needed to undo it.
 */

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const coachChats = pgTable(
  'coach_chats',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    title: text().notNull().default('New chat'),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.updatedAt)],
);

export const coachMessages = pgTable(
  'coach_messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    chatId: uuid()
      .notNull()
      .references(() => coachChats.id, { onDelete: 'cascade' }),
    userId: text().notNull(),
    /** 'user' | 'assistant' (model turns, incl. tool calls) | 'tool' (tool results) | 'event' (app notes). */
    role: text().notNull(),
    /** Model content blocks exactly as sent or received; replayed to the model. */
    content: jsonb().notNull(),
    /** What the app shows for this message; null when it isn't shown (tool results). */
    display: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.chatId, t.createdAt)],
);

export const coachAttachments = pgTable(
  'coach_attachments',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    /** 'image'. */
    kind: text().notNull(),
    mime: text().notNull(),
    data: bytea().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

export const coachNotes = pgTable(
  'coach_notes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    text: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

export const agentActions = pgTable(
  'agent_actions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull(),
    /** Who did it: 'coach', or 'agent:<name>' for an outside agent. */
    actor: text().notNull(),
    chatId: uuid(),
    /** The outside agent's connection (an agent_keys id), if any. */
    connectionId: text(),
    /** The tool, e.g. 'log_meal'. */
    tool: text().notNull(),
    /** One line for people: "Logged chicken bowl, 640 kcal". */
    summary: text().notNull(),
    /** 'applied' | 'pending' (waiting for the user to confirm) | 'undone' | 'cancelled'. */
    status: text().notNull(),
    /** The validated tool input (what to apply, for pending actions). */
    input: jsonb().notNull(),
    /** How to reverse it once applied. */
    undo: jsonb(),
    createdAt: createdAt(),
    settledAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
