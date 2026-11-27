import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  PayloadTooLargeException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_BODY_KEY = 'heroarc:maxBody';

/** Allow a bigger body on a route that takes files (photos, voice notes, a spreadsheet). */
export const MaxBody = (bytes: number) => SetMetadata(MAX_BODY_KEY, bytes);

/**
 * Same protection as the original Worker for app writes (CSRF):
 *  - POSTs must carry `x-heroarc: 1` (a custom header forces a CORS preflight, so a
 *    foreign site can't send it), and
 *  - if the browser sends an Origin, it must be our own host.
 * Small bodies only (16 KB), unless the route says otherwise with @MaxBody. GETs pass through.
 */
@Injectable()
export class HeroarcClientGuard implements CanActivate {
  constructor(@Optional() private readonly reflector?: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === 'GET' || req.method === 'HEAD') return true;

    if (req.headers['x-heroarc'] !== '1') throw new ForbiddenException();

    const origin = req.headers.origin;
    if (origin) {
      const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (!originHost || originHost !== host) throw new ForbiddenException();
    }

    const max =
      this.reflector?.getAllAndOverride<number | undefined>(MAX_BODY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? MAX_BODY_BYTES;
    const length = Number(req.headers['content-length'] ?? 0);
    if (length > max) throw new PayloadTooLargeException();
    return true;
  }
}
