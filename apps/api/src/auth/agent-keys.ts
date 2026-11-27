import { createHash, randomBytes } from 'node:crypto';
import { and, type DbHandle, desc, eq, isNull, lt, or, schema } from '@heroarc/db';
import { Inject, Injectable } from '@nestjs/common';
import { DB } from '../infra/tokens.js';

const { agentKeys } = schema;

/** Every key starts with this, so leaked keys are easy to spot (and scan for). */
export const KEY_PREFIX = 'hak_';
const MAX_KEYS = 20;

export const hashAgentKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** A new key: the secret (shown once), its visible prefix, and the hash we keep. */
export function newAgentKey() {
  const secret = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { secret, prefix: secret.slice(0, KEY_PREFIX.length + 6), hash: hashAgentKey(secret) };
}

/** The key in an Authorization header: "Bearer <key>" (any case), or a bare key like the original API took. */
export function keyFromHeader(header: string | undefined): string {
  const h = (header ?? '').trim();
  return (h.slice(0, 7).toLowerCase() === 'bearer ' ? h.slice(7) : h).trim();
}

export type AgentKeyRow = typeof agentKeys.$inferSelect;

/** API keys for outside agents. Only hashes are stored. */
@Injectable()
export class AgentKeysService {
  constructor(@Inject(DB) private readonly dbh: DbHandle) {}

  private get db() {
    return this.dbh.db;
  }

  list(userId: string): Promise<AgentKeyRow[]> {
    return this.db
      .select()
      .from(agentKeys)
      .where(and(eq(agentKeys.userId, userId), isNull(agentKeys.revokedAt)))
      .orderBy(desc(agentKeys.createdAt));
  }

  async create(userId: string, name: string): Promise<{ row: AgentKeyRow; secret: string }> {
    if ((await this.list(userId)).length >= MAX_KEYS)
      throw new Error(`At most ${MAX_KEYS} keys; revoke one first.`);
    const k = newAgentKey();
    const [row] = await this.db
      .insert(agentKeys)
      .values({ userId, name: name.trim(), prefix: k.prefix, hash: k.hash })
      .returning();
    return { row: row as AgentKeyRow, secret: k.secret };
  }

  async revoke(userId: string, id: string): Promise<void> {
    await this.db
      .update(agentKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(agentKeys.userId, userId), eq(agentKeys.id, id), isNull(agentKeys.revokedAt)));
  }

  /** The live key this secret belongs to, or undefined. */
  async verify(secret: string): Promise<AgentKeyRow | undefined> {
    if (!secret.startsWith(KEY_PREFIX) || secret.length > 100) return undefined;
    const [row] = await this.db
      .select()
      .from(agentKeys)
      .where(and(eq(agentKeys.hash, hashAgentKey(secret)), isNull(agentKeys.revokedAt)));
    return row;
  }

  /** Note that a key was used (at most once a minute per key). */
  async touch(id: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(agentKeys)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(agentKeys.id, id),
          or(
            isNull(agentKeys.lastUsedAt),
            lt(agentKeys.lastUsedAt, new Date(now.getTime() - 60_000)),
          ),
        ),
      );
  }
}
