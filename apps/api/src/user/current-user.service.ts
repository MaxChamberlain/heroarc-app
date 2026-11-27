import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { type RequestUser, requestContext } from '../auth/request-context.js';

/**
 * Who the request acts for, and their timezone: the signed-in user (SessionMiddleware), or the
 * user an agent key / token belongs to (agent auth). Every per-user query goes through here.
 */
@Injectable()
export class CurrentUserService {
  private current(): RequestUser {
    const u = requestContext.getStore();
    if (!u) throw new UnauthorizedException('Sign in to continue.');
    return u;
  }

  userId(): string {
    return this.current().userId;
  }

  timeZone(): string {
    return this.current().timeZone;
  }

  isAdmin(): boolean {
    return this.current().role === 'admin';
  }

  /** The outside agent making this request (API key or token), or null for the app itself. */
  agent(): { connectionId: string; actor: string } | null {
    const u = this.current();
    return u.via === 'agent' && u.connectionId && u.actor
      ? { connectionId: u.connectionId, actor: u.actor }
      : null;
  }

  requireAdmin(): void {
    if (!this.isAdmin()) throw new ForbiddenException('Admins only.');
  }
}
