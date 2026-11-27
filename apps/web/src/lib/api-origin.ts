/**
 * Where server-side code reaches the API.
 * - Local dev: http://localhost:4000 (default)
 * - Render: http://<INTERNAL_API_HOSTPORT> (private network, set in render.yaml)
 * - INTERNAL_API_URL overrides both.
 */
export function apiOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.INTERNAL_API_URL) return env.INTERNAL_API_URL;
  if (env.INTERNAL_API_HOSTPORT) return `http://${env.INTERNAL_API_HOSTPORT}`;
  return 'http://localhost:4000';
}
