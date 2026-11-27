import { createFileRoute } from '@tanstack/react-router';
import { proxyToApi } from '../../server/proxy';

const forward = ({ request }: { request: Request }) => proxyToApi(request);

// OAuth discovery for MCP clients (authorization server metadata for /api/auth): the API serves
// it, like the rest of sign-in.
export const Route = createFileRoute('/.well-known/$')({
  server: { handlers: { GET: forward, HEAD: forward, OPTIONS: forward } },
});
