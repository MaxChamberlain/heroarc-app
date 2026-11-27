import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { orpc } from '../lib/orpc';

export const Route = createFileRoute('/status')({
  component: Home,
});

// Status page: proves web → /api proxy → API → Postgres + Valkey end to end.
function Home() {
  const health = useQuery({
    ...orpc.system.health.queryOptions(),
    enabled: typeof window !== 'undefined',
  });

  const status = health.isPending
    ? 'checking…'
    : health.data?.ok
      ? 'ok'
      : health.data
        ? 'degraded'
        : 'unavailable';

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, lineHeight: 1.5 }}>
      <h1>HeroArc</h1>
      <p>Rebuild in progress.</p>
      <p data-testid="api-status">API: {status}</p>
      {health.data && (
        <p data-testid="api-checks">
          db: {health.data.checks.db} · kv: {health.data.checks.kv} · version {health.data.version}
        </p>
      )}
    </main>
  );
}
