import type Anthropic from '@anthropic-ai/sdk';
import type { Chat, ChatSummary, CoachEvent, CoachMessage, Receipt } from '@heroarc/contracts';
import { and, asc, type DbHandle, desc, eq, inArray, schema } from '@heroarc/db';
import { localClock, localDate } from '@heroarc/domain';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AgentContext, AgentService, type Changed } from '../agent/agent.service.js';
import { TOOLS, toolSchemas } from '../agent/tools.js';
import { DB } from '../infra/tokens.js';
import { Channel } from './channel.js';
import type { CoachModel } from './model.js';
import { SYSTEM_PROMPT } from './prompt.js';
import type { Transcriber } from './transcriber.js';

export const COACH_MODEL = Symbol('COACH_MODEL');
export const TRANSCRIBER = Symbol('TRANSCRIBER');

const { coachAttachments, coachChats, coachMessages, coachNotes } = schema;

/** Most model turns in one reply (each tool round trip is a turn). */
const MAX_TURNS = 10;

export interface SendInput {
  chatId?: string;
  text: string;
  images?: File[];
  audio?: File;
  audioMs?: number;
}

/** Stored per message for the app (coach_messages.display). */
interface Display {
  text?: string;
  images?: string[];
  voice?: { ms: number; transcript: string };
  receipts?: Receipt[];
}

/** Our own content block in stored user messages: a photo, expanded when replayed. */
interface ImageRef {
  type: 'image_ref';
  id: string;
}
type StoredBlock = Anthropic.ContentBlockParam | ImageRef;

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export class CoachError extends Error {
  constructor(
    readonly code: 'not_found' | 'bad_request',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Coach conversations: saves each message, runs the model with the agent tools, and streams
 * the reply as CoachEvents (text, receipts, app actions).
 */
@Injectable()
export class CoachService {
  private readonly log = new Logger('Coach');

  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(COACH_MODEL) private readonly model: CoachModel | null,
    @Inject(TRANSCRIBER) private readonly stt: Transcriber | null,
    private readonly agent: AgentService,
  ) {}

  private get db() {
    return this.dbh.db;
  }

  status() {
    return { enabled: !!this.model, voice: !!this.stt, scripted: this.model?.name === 'fake' };
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Sending                                                                                   */

  async *send(
    ctx: AgentContext,
    input: SendInput,
    signal?: AbortSignal,
  ): AsyncGenerator<CoachEvent> {
    if (!this.model) {
      yield {
        type: 'error',
        message: "Coach isn't set up yet: the server needs an ANTHROPIC_API_KEY.",
      };
      return;
    }
    const images = input.images ?? [];
    if (!input.text.trim() && !images.length && !input.audio) {
      yield { type: 'error', message: 'Write something, or attach a photo or a voice note.' };
      return;
    }
    if (input.audio && !this.stt) {
      yield {
        type: 'error',
        message: "Voice notes aren't set up yet: the server needs an OPENAI_API_KEY.",
      };
      return;
    }

    let transcript = '';
    if (input.audio) {
      try {
        transcript = await (this.stt as Transcriber).transcribe(input.audio);
      } catch (e) {
        this.log.warn(`Transcription failed: ${String(e)}`);
        yield {
          type: 'error',
          message: "Couldn't understand that voice note. Try again, or type it.",
        };
        return;
      }
    }

    const chatId = await this.chatFor(
      ctx.userId,
      input.chatId,
      input.text || (images.length ? 'Photo' : 'Voice note'),
    );
    const imageIds: string[] = [];
    for (const f of images) {
      const [row] = await this.db
        .insert(coachAttachments)
        .values({
          userId: ctx.userId,
          kind: 'image',
          mime: f.type || 'image/jpeg',
          data: Buffer.from(await f.arrayBuffer()),
        })
        .returning({ id: coachAttachments.id });
      if (row) imageIds.push(row.id);
    }

    const said = [input.text.trim(), transcript && `(Voice note) ${transcript}`]
      .filter(Boolean)
      .join('\n\n');
    const content: StoredBlock[] = [
      { type: 'text', text: await this.context(ctx, imageIds) },
      ...imageIds.map((id): ImageRef => ({ type: 'image_ref', id })),
      { type: 'text', text: said || '(photo)' },
    ];
    const display: Display = {
      text: input.text.trim(),
      ...(imageIds.length && { images: imageIds }),
      ...(input.audio && { voice: { ms: input.audioMs ?? 0, transcript } }),
    };
    const userRow = await this.save(ctx.userId, chatId, 'user', content, display);
    yield { type: 'start', chatId, message: this.userMessage(userRow) };

    const out = new Channel<CoachEvent>();
    const run = this.reply({ ...ctx, chatId }, out, signal).finally(() => out.close());
    for await (const ev of out) yield ev;
    await run;
  }

  /** The model ↔ tools loop for one reply. Pushes events; never throws. */
  private async reply(
    ctx: AgentContext & { chatId: string },
    out: Channel<CoachEvent>,
    signal?: AbortSignal,
  ) {
    const model = this.model as CoachModel;
    const tools = toolSchemas().map((t) => ({
      ...t,
      eager_input_streaming: true,
    })) as Anthropic.Tool[];
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ];
    let firstId: string | undefined;
    let text = '';
    const receipts: Receipt[] = [];
    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const messages = await this.history(ctx.userId, ctx.chatId);
        let said = '';
        const result = await model.turn(
          { system, tools, messages },
          (delta) => {
            said += delta;
            out.push({ type: 'text', delta });
          },
          signal,
        );
        if (result.stopReason === 'refusal') {
          out.push({ type: 'error', message: "Coach can't help with that one." });
          break;
        }
        const uses = result.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );
        if (uses.length && result.stopReason === 'max_tokens') {
          out.push({ type: 'error', message: 'Coach got cut off. Try asking for less at once.' });
          break;
        }
        const row = await this.save(ctx.userId, ctx.chatId, 'assistant', result.content, {
          text: said.trim(),
        });
        firstId ??= row.id;
        if (said.trim()) text = text ? `${text}\n\n${said.trim()}` : said.trim();
        if (!uses.length) break;

        const results: Anthropic.ToolResultBlockParam[] = [];
        const turnReceipts: Receipt[] = [];
        const changed = new Set<Changed[number]>();
        for (const use of uses) {
          out.push({
            type: 'status',
            text: TOOLS[use.name as keyof typeof TOOLS]?.status ?? 'Working…',
          });
          const r = await this.agent.run(ctx, use.name, use.input);
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: r.result,
            ...(r.isError && { is_error: true }),
          });
          if (r.receipt) {
            turnReceipts.push(r.receipt);
            out.push({ type: 'receipt', receipt: r.receipt });
          }
          if (r.app) out.push({ type: 'app', action: r.app });
          for (const c of r.changed ?? []) changed.add(c);
        }
        if (changed.size) out.push({ type: 'changed', what: [...changed] });
        receipts.push(...turnReceipts);
        await this.save(
          ctx.userId,
          ctx.chatId,
          'tool',
          results,
          turnReceipts.length ? { receipts: turnReceipts } : null,
        );
      }
    } catch (e) {
      if (!signal?.aborted) {
        this.log.error(`Coach reply failed: ${e instanceof Error ? e.stack : String(e)}`);
        out.push({
          type: 'error',
          message: "Coach couldn't answer just now. Try again in a moment.",
        });
      }
    }
    await this.db
      .update(coachChats)
      .set({ updatedAt: new Date() })
      .where(eq(coachChats.id, ctx.chatId));
    out.push({
      type: 'done',
      message: {
        id: firstId ?? `none-${Date.now()}`,
        role: 'coach',
        text,
        ...(receipts.length && { receipts }),
        at: new Date().toISOString(),
      },
    });
  }

  /** Per-message facts: now, notes about the user, this message's photo ids. */
  private async context(ctx: AgentContext, imageIds: string[]): Promise<string> {
    const now = ctx.now ?? new Date();
    const today = localDate(now, ctx.timeZone);
    const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    const notes = await this.db
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.userId, ctx.userId))
      .orderBy(asc(coachNotes.createdAt));
    return [
      '<context>',
      `Now: ${weekday} ${today}, ${localClock(now, ctx.timeZone)} (${ctx.timeZone}). "Today" means ${today}.`,
      imageIds.length &&
        `Photos in this message: ${imageIds.join(', ')} (pass one as photo_id when logging a meal from it).`,
      notes.length
        ? `What you know about the user (ids for forget):\n${notes.map((n) => `- [${n.id}] ${n.text}`).join('\n')}`
        : 'You have no notes about the user yet.',
      '</context>',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** The chat as model messages: photos expanded, unfinished tool calls closed off. */
  private async history(userId: string, chatId: string): Promise<Anthropic.MessageParam[]> {
    const rows = await this.db
      .select({ role: coachMessages.role, content: coachMessages.content })
      .from(coachMessages)
      .where(and(eq(coachMessages.chatId, chatId), eq(coachMessages.userId, userId)))
      .orderBy(asc(coachMessages.createdAt));
    const ids = rows.flatMap((r) =>
      (r.content as StoredBlock[])
        .filter((b): b is ImageRef => b.type === 'image_ref')
        .map((b) => b.id),
    );
    const photos = new Map<string, { mime: string; data: Buffer }>();
    if (ids.length) {
      const found = await this.db
        .select({
          id: coachAttachments.id,
          mime: coachAttachments.mime,
          data: coachAttachments.data,
        })
        .from(coachAttachments)
        .where(and(eq(coachAttachments.userId, userId), inArray(coachAttachments.id, ids)));
      for (const p of found) photos.set(p.id, p);
    }
    const out: Anthropic.MessageParam[] = [];
    for (const [i, r] of rows.entries()) {
      const blocks = r.content as StoredBlock[];
      if (r.role === 'assistant') {
        out.push({ role: 'assistant', content: blocks as Anthropic.ContentBlockParam[] });
        // A reply that stopped between a tool call and its result: close the calls off.
        const next = rows[i + 1];
        const pending = blocks.filter(
          (b): b is Anthropic.ToolUseBlockParam => b.type === 'tool_use',
        );
        if (pending.length && next?.role !== 'tool')
          out.push({
            role: 'user',
            content: pending.map((p) => ({
              type: 'tool_result',
              tool_use_id: p.id,
              content: 'Interrupted.',
              is_error: true,
            })),
          });
        continue;
      }
      const content = blocks.flatMap((b): Anthropic.ContentBlockParam[] => {
        if (b.type !== 'image_ref') return [b];
        const p = photos.get(b.id);
        return p
          ? [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: p.mime as 'image/jpeg',
                  data: p.data.toString('base64'),
                },
              },
            ]
          : [{ type: 'text', text: '(photo no longer available)' }];
      });
      out.push({ role: 'user', content });
    }
    return out;
  }

  private async chatFor(
    userId: string,
    chatId: string | undefined,
    firstText: string,
  ): Promise<string> {
    if (chatId) {
      const [c] = isUuid(chatId)
        ? await this.db
            .select()
            .from(coachChats)
            .where(and(eq(coachChats.id, chatId), eq(coachChats.userId, userId)))
        : [];
      if (c) return c.id;
    }
    const title = firstText.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat';
    const [c] = await this.db
      .insert(coachChats)
      .values({ userId, title })
      .returning({ id: coachChats.id });
    return c?.id as string;
  }

  private async save(
    userId: string,
    chatId: string,
    role: string,
    content: unknown,
    display: Display | null,
  ) {
    const [row] = await this.db
      .insert(coachMessages)
      .values({ userId, chatId, role, content: content as object, display })
      .returning();
    return row as typeof coachMessages.$inferSelect;
  }

  /** Tell Coach (next time it runs) what the user did with one of its actions. */
  async note(userId: string, chatId: string | null, text: string): Promise<void> {
    if (!chatId) return;
    await this.save(userId, chatId, 'event', [{ type: 'text', text: `[app] ${text}` }], null);
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Reading chats                                                                             */

  private userMessage(r: typeof coachMessages.$inferSelect): CoachMessage {
    const d = (r.display ?? {}) as Display;
    return {
      id: r.id,
      role: 'user',
      text: d.text ?? '',
      ...(d.images?.length && { images: d.images }),
      ...(d.voice && { voice: d.voice }),
      at: r.createdAt.toISOString(),
    };
  }

  async chats(userId: string): Promise<ChatSummary[]> {
    const rows = await this.db
      .select()
      .from(coachChats)
      .where(eq(coachChats.userId, userId))
      .orderBy(desc(coachChats.updatedAt))
      .limit(50);
    return rows.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }));
  }

  /** A chat as the app shows it: each Coach reply (text and receipts) merged into one message. */
  async chat(userId: string, chatId: string): Promise<Chat> {
    const [c] = isUuid(chatId)
      ? await this.db
          .select()
          .from(coachChats)
          .where(and(eq(coachChats.id, chatId), eq(coachChats.userId, userId)))
      : [];
    if (!c) throw new CoachError('not_found', 'No such chat.');
    const rows = await this.db
      .select()
      .from(coachMessages)
      .where(eq(coachMessages.chatId, c.id))
      .orderBy(asc(coachMessages.createdAt));
    const messages: CoachMessage[] = [];
    let coach: CoachMessage | null = null;
    for (const r of rows) {
      const d = (r.display ?? {}) as Display;
      if (r.role === 'user') {
        coach = null;
        messages.push(this.userMessage(r));
      } else if (r.role === 'assistant' || r.role === 'tool') {
        if (!coach) {
          coach = { id: r.id, role: 'coach', text: '', at: r.createdAt.toISOString() };
          messages.push(coach);
        }
        if (d.text) coach.text = coach.text ? `${coach.text}\n\n${d.text}` : d.text;
        if (d.receipts?.length) coach.receipts = [...(coach.receipts ?? []), ...d.receipts];
      }
    }
    // Receipts show their status now (applied, undone…), not when they were made.
    const ids = messages.flatMap((m) => m.receipts?.map((x) => x.actionId) ?? []);
    const status = await this.agent.statuses(userId, ids);
    for (const m of messages)
      if (m.receipts)
        m.receipts = m.receipts.map((x) => ({ ...x, status: status.get(x.actionId) ?? x.status }));
    return {
      id: c.id,
      title: c.title,
      messages: messages.filter((m) => m.role !== 'coach' || m.text || m.receipts),
    };
  }

  async deleteChat(userId: string, chatId: string): Promise<void> {
    if (!isUuid(chatId)) return;
    await this.db
      .delete(coachChats)
      .where(and(eq(coachChats.id, chatId), eq(coachChats.userId, userId)));
  }

  async attachment(userId: string, id: string): Promise<{ mime: string; data: Buffer }> {
    const [a] = isUuid(id)
      ? await this.db
          .select()
          .from(coachAttachments)
          .where(and(eq(coachAttachments.id, id), eq(coachAttachments.userId, userId)))
      : [];
    if (!a) throw new CoachError('not_found', 'No such photo.');
    return a;
  }

  async notes(userId: string) {
    const rows = await this.db
      .select()
      .from(coachNotes)
      .where(eq(coachNotes.userId, userId))
      .orderBy(asc(coachNotes.createdAt));
    return rows.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt.toISOString() }));
  }

  async deleteNote(userId: string, id: string): Promise<void> {
    if (!isUuid(id)) return;
    await this.db
      .delete(coachNotes)
      .where(and(eq(coachNotes.id, id), eq(coachNotes.userId, userId)));
  }
}
