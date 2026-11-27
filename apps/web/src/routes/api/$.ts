import { createFileRoute } from '@tanstack/react-router';
import { proxyToApi } from '../../server/proxy';

const forward = ({ request }: { request: Request }) => proxyToApi(request);

// Everything under /api/* belongs to the API service (web API, Better Auth, chat SSE).
export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: forward,
      HEAD: forward,
      POST: forward,
      PUT: forward,
      PATCH: forward,
      DELETE: forward,
      OPTIONS: forward,
    },
  },
});
