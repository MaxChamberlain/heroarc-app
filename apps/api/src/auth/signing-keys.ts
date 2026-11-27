import { type DbHandle, inArray, schema } from '@heroarc/db';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type SecretConfig, symmetricDecrypt } from 'better-auth/crypto';
import { DB } from '../infra/tokens.js';
import type { Auth } from './auth.js';
import { AUTH } from './tokens.js';

const { jwks } = schema;

/**
 * Token-signing keys (for apps connected with OAuth) are stored encrypted with
 * BETTER_AUTH_SECRET. If the secret changes, the old keys can't be read and every token request
 * would fail. At startup, drop keys the current secret can't read: Better Auth makes a new one
 * when it next signs, and connected apps carry on by refreshing their tokens.
 */
@Injectable()
export class SigningKeysCheck implements OnApplicationBootstrap {
  private readonly log = new Logger('SigningKeys');

  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB) private readonly dbh: DbHandle,
  ) {}

  async onApplicationBootstrap() {
    try {
      const removed = await dropUnreadableKeys(
        this.dbh,
        (await this.auth.$context).secretConfig as string | SecretConfig,
      );
      if (removed)
        this.log.warn(
          `Removed ${removed} token-signing key(s) made with a previous BETTER_AUTH_SECRET; a new one is made when needed.`,
        );
    } catch (e) {
      this.log.error(`Couldn't check token-signing keys: ${(e as Error).message}`);
    }
  }
}

/** Delete the keys `secret` can't decrypt; returns how many. */
export async function dropUnreadableKeys(
  dbh: DbHandle,
  secret: string | SecretConfig,
): Promise<number> {
  const rows = await dbh.db.select({ id: jwks.id, privateKey: jwks.privateKey }).from(jwks);
  const unreadable: string[] = [];
  for (const r of rows) {
    try {
      await symmetricDecrypt({ key: secret, data: JSON.parse(r.privateKey) });
    } catch {
      unreadable.push(r.id);
    }
  }
  if (unreadable.length) await dbh.db.delete(jwks).where(inArray(jwks.id, unreadable));
  return unreadable.length;
}
