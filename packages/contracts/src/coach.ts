import { eventIterator, oc } from '@orpc/contract';
import { z } from 'zod';
import { CardId } from './layout.js';

/*
 * Coach: the in-app assistant. It answers from the user's data and acts through agent tools
 * (log meals, edit past records, rearrange the dashboard, …). New entries apply at once with
 * an Undo; edits, deletes and layout changes wait for the user to tap Apply.
 */

const Id = z.string().min(1).max(64);

/** Every theme id (the web app's themes registry must match; a web test checks it). */
export const THEME_IDS = [
  'simple',
  'night',
  'alchemist',
  'streetfighter',
  'cyberpunk',
  'greekgod',
  'beige84',
  'colorarchive',
] as const;

/** Something Coach did or proposes, as the app shows it (backed by agent_actions). */
export const Receipt = z.object({
  actionId: Id,
  tool: z.string(),
  /** One line: "Logged lunch: chicken bowl, 640 kcal". */
  summary: z.string(),
  /** applied (Undo available) · pending (Apply / Cancel) · undone · cancelled. */
  status: z.enum(['applied', 'pending', 'undone', 'cancelled']),
});
export type Receipt = z.infer<typeof Receipt>;

/** A message as the app shows it. Coach turns (text plus receipts) arrive merged. */
export const CoachMessage = z.object({
  id: Id,
  role: z.enum(['user', 'coach', 'event']),
  text: z.string(),
  /** Photo attachment ids (GET /api/v1/coach/attachments/{id}). */
  images: z.array(Id).optional(),
  voice: z.object({ ms: z.number(), transcript: z.string() }).optional(),
  receipts: z.array(Receipt).optional(),
  at: z.string(),
});
export type CoachMessage = z.infer<typeof CoachMessage>;

export const ChatSummary = z.object({ id: Id, title: z.string(), updatedAt: z.string() });
export type ChatSummary = z.infer<typeof ChatSummary>;

export const Chat = z.object({ id: Id, title: z.string(), messages: z.array(CoachMessage) });
export type Chat = z.infer<typeof Chat>;

/** Things Coach can do in the app itself (not in the data). */
export const AppAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('show_day'), date: z.string() }),
  z.object({ kind: z.literal('set_theme'), theme: z.string() }),
  z.object({ kind: z.literal('open_card'), card: CardId, view: z.string().optional() }),
]);
export type AppAction = z.infer<typeof AppAction>;

/** What changed on the server, so the app can refresh it. */
export const Changed = z.array(z.enum(['data', 'layout', 'notes']));

/** Streamed while Coach answers. */
export const CoachEvent = z.discriminatedUnion('type', [
  /** First: the chat (new or existing) and the saved user message (with its transcript). */
  z.object({ type: z.literal('start'), chatId: Id, message: CoachMessage }),
  z.object({ type: z.literal('text'), delta: z.string() }),
  /** What Coach is doing right now ("Looking at last week…"). */
  z.object({ type: z.literal('status'), text: z.string() }),
  z.object({ type: z.literal('receipt'), receipt: Receipt }),
  z.object({ type: z.literal('app'), action: AppAction }),
  z.object({ type: z.literal('changed'), what: Changed }),
  z.object({ type: z.literal('error'), message: z.string() }),
  /** Last: Coach's reply as saved. */
  z.object({ type: z.literal('done'), message: CoachMessage }),
]);
export type CoachEvent = z.infer<typeof CoachEvent>;

export const CoachStatus = z.object({
  /** False until the server has an Anthropic API key. */
  enabled: z.boolean(),
  /** Voice notes need an OpenAI API key for transcription. */
  voice: z.boolean(),
  /** The scripted test stand-in is answering (COACH_MODEL=fake), not Claude. */
  scripted: z.boolean(),
});

export const CoachNote = z.object({ id: Id, text: z.string(), createdAt: z.string() });

export const ActionResult = z.object({ receipt: Receipt, changed: Changed });

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_AUDIO = 10 * 1024 * 1024;

export const coachContract = {
  status: oc
    .route({
      method: 'GET',
      path: '/api/v1/coach/status',
      summary: 'Whether Coach (and voice) is set up.',
      tags: ['coach'],
    })
    .output(CoachStatus),
  send: oc
    .route({
      method: 'POST',
      path: '/api/v1/coach/send',
      summary: 'Send Coach a message (text, up to four photos, a voice note); streams the reply.',
      tags: ['coach'],
    })
    .input(
      z.object({
        /** Omit to start a new chat. */
        chatId: Id.optional(),
        text: z.string().max(4000).default(''),
        images: z
          .array(z.file().max(MAX_IMAGE).mime(['image/jpeg', 'image/png', 'image/webp']))
          .max(4)
          .optional(),
        audio: z.file().max(MAX_AUDIO).optional(),
        /** Length of the voice note (ms), as recorded. */
        audioMs: z.coerce.number().int().min(0).max(300_000).optional(),
      }),
    )
    .output(eventIterator(CoachEvent)),
  chats: oc
    .route({
      method: 'GET',
      path: '/api/v1/coach/chats',
      summary: 'Saved chats, newest first.',
      tags: ['coach'],
    })
    .output(z.array(ChatSummary)),
  chat: oc
    .route({
      method: 'GET',
      path: '/api/v1/coach/chats/{id}',
      summary: 'One chat with its messages.',
      tags: ['coach'],
    })
    .input(z.object({ id: Id }))
    .output(Chat),
  deleteChat: oc
    .route({
      method: 'DELETE',
      path: '/api/v1/coach/chats/{id}',
      summary: 'Delete a chat.',
      tags: ['coach'],
    })
    .input(z.object({ id: Id }))
    .output(z.object({ ok: z.literal(true) })),
  attachment: oc
    .route({
      method: 'GET',
      path: '/api/v1/coach/attachments/{id}',
      summary: 'A photo sent to Coach.',
      tags: ['coach'],
      outputStructure: 'detailed',
    })
    .input(z.object({ id: Id }))
    .output(z.object({ headers: z.object({ 'cache-control': z.string() }), body: z.file() })),
  confirm: oc
    .route({
      method: 'POST',
      path: '/api/v1/coach/actions/{id}/confirm',
      summary: 'Apply a change Coach proposed.',
      tags: ['coach'],
    })
    .input(z.object({ id: Id }))
    .output(ActionResult),
  cancel: oc
    .route({
      method: 'POST',
      path: '/api/v1/coach/actions/{id}/cancel',
      summary: 'Decline a change Coach proposed.',
      tags: ['coach'],
    })
    .input(z.object({ id: Id }))
    .output(ActionResult),
  undo: oc
    .route({
      method: 'POST',
      path: '/api/v1/coach/actions/{id}/undo',
      summary: 'Undo something Coach did.',
      tags: ['coach'],
    })
    .input(z.object({ id: Id }))
    .output(ActionResult),
  notes: oc
    .route({
      method: 'GET',
      path: '/api/v1/coach/notes',
      summary: 'What Coach remembers about the user.',
      tags: ['coach'],
    })
    .output(z.array(CoachNote)),
  deleteNote: oc
    .route({
      method: 'DELETE',
      path: '/api/v1/coach/notes/{id}',
      summary: 'Forget one note.',
      tags: ['coach'],
    })
    .input(z.object({ id: Id }))
    .output(z.object({ ok: z.literal(true) })),
};
