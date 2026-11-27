import { createFileRoute } from '@tanstack/react-router';

// Liveness probe for Render's health check on the web service.
export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true }),
    },
  },
});
