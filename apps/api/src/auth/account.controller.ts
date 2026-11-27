import { randomBytes } from 'node:crypto';
import { contract, type Invite } from '@heroarc/contracts';
import { and, type DbHandle, desc, eq, isNull, schema } from '@heroarc/db';
import { Controller, Inject, UseGuards } from '@nestjs/common';
import { Implement, implement, ORPCError } from '@orpc/nest';
import { HeroarcClientGuard } from '../common/heroarc-client.guard.js';
import type { Env } from '../infra/env.js';
import { DB, ENV } from '../infra/tokens.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { findInvite } from './auth.js';
import { email, type Mailer } from './mailer.js';
import { MAILER } from './tokens.js';

const { invites, user, userProfiles } = schema;
const INVITE_DAYS = 14;

@Controller()
@UseGuards(HeroarcClientGuard)
export class AccountController {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ENV) private readonly env: Env,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly current: CurrentUserService,
  ) {}

  private get db() {
    return this.dbh.db;
  }

  private async me() {
    const id = this.current.userId();
    const [u] = await this.db.select().from(user).where(eq(user.id, id));
    const [p] = await this.db.select().from(userProfiles).where(eq(userProfiles.userId, id));
    if (!u || !p) throw new ORPCError('UNAUTHORIZED');
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.displayUsername ?? u.username ?? null,
      role: p.role === 'admin' ? ('admin' as const) : ('member' as const),
      timezone: p.timezone,
      onboarded: p.onboarded,
    };
  }

  private invite(i: typeof invites.$inferSelect): Invite {
    return {
      code: i.code,
      url: `${this.env.APP_URL}/invite/${i.code}`,
      email: i.email,
      role: i.role === 'admin' ? 'admin' : 'member',
      expiresAt: i.expiresAt.toISOString(),
      usedAt: i.usedAt?.toISOString() ?? null,
    };
  }

  @Implement(contract.account.authOptions)
  authOptions() {
    return implement(contract.account.authOptions).handler(() => ({
      google: !!(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET),
    }));
  }

  @Implement(contract.account.me)
  getMe() {
    return implement(contract.account.me).handler(() => this.me());
  }

  @Implement(contract.account.updateMe)
  updateMe() {
    return implement(contract.account.updateMe).handler(async ({ input }) => {
      const id = this.current.userId();
      if (input.name)
        await this.db
          .update(user)
          .set({ name: input.name, updatedAt: new Date() })
          .where(eq(user.id, id));
      if (input.timezone || input.onboarded != null)
        await this.db
          .update(userProfiles)
          .set({
            ...(input.timezone && { timezone: input.timezone }),
            ...(input.onboarded != null && { onboarded: input.onboarded }),
            updatedAt: new Date(),
          })
          .where(eq(userProfiles.userId, id));
      return this.me();
    });
  }

  @Implement(contract.account.checkInvite)
  checkInvite() {
    return implement(contract.account.checkInvite).handler(async ({ input }) => {
      const inv = await findInvite(this.db, input.code);
      return { valid: !!inv, email: inv?.email ?? null };
    });
  }

  @Implement(contract.account.invites)
  list() {
    return implement(contract.account.invites).handler(async () => {
      this.current.requireAdmin();
      const rows = await this.db.select().from(invites).orderBy(desc(invites.createdAt)).limit(100);
      return rows.map((i) => this.invite(i));
    });
  }

  @Implement(contract.account.createInvite)
  create() {
    return implement(contract.account.createInvite).handler(async ({ input }) => {
      this.current.requireAdmin();
      const [row] = await this.db
        .insert(invites)
        .values({
          code: randomBytes(12).toString('base64url'),
          email: input.email?.toLowerCase() ?? null,
          role: input.role,
          createdBy: this.current.userId(),
          expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
        })
        .returning();
      const inv = this.invite(row as typeof invites.$inferSelect);
      if (input.email) {
        const m = email(
          "You're invited to HeroArc",
          [
            'You have been invited to HeroArc, a personal health dashboard with a hero that grows as you look after yourself.',
            `The link works for ${INVITE_DAYS} days.`,
          ],
          { label: 'Join HeroArc', url: inv.url },
        );
        await this.mailer.send(input.email, "You're invited to HeroArc", m.text, m.html);
      }
      return inv;
    });
  }

  @Implement(contract.account.revokeInvite)
  revoke() {
    return implement(contract.account.revokeInvite).handler(async ({ input }) => {
      this.current.requireAdmin();
      await this.db
        .delete(invites)
        .where(and(eq(invites.code, input.code), isNull(invites.usedAt)));
      return { ok: true as const };
    });
  }
}
