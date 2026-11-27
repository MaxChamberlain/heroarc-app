import { Controller, Get } from '@nestjs/common';

/**
 * Liveness probe for Render's health check. Deliberately does not touch the
 * database or Valkey, so a dependency blip doesn't make Render restart the service.
 * The deep check lives at GET /api/v1/system/health.
 */
@Controller()
export class HealthController {
  @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }
}
