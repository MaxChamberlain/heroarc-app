import type { Layout } from '@heroarc/contracts';
import { type DbHandle, eq, schema } from '@heroarc/db';
import { normalizeLayout } from '@heroarc/domain';
import { Inject, Injectable } from '@nestjs/common';
import { DB } from '../infra/tokens.js';

const { userLayouts } = schema;

/** One dashboard layout per user. Always returned normalized (safe to render). */
@Injectable()
export class LayoutService {
  constructor(@Inject(DB) private readonly dbh: DbHandle) {}

  async get(userId: string): Promise<Layout> {
    const rows = await this.dbh.db
      .select({ layout: userLayouts.layout })
      .from(userLayouts)
      .where(eq(userLayouts.userId, userId));
    return normalizeLayout(rows[0]?.layout ?? null);
  }

  async save(userId: string, layout: Layout): Promise<Layout> {
    const clean = normalizeLayout(layout);
    await this.dbh.db
      .insert(userLayouts)
      .values({ userId, layout: clean })
      .onConflictDoUpdate({
        target: userLayouts.userId,
        set: { layout: clean, updatedAt: new Date() },
      });
    return clean;
  }
}
