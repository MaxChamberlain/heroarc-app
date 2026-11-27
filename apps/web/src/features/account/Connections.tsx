import type { AgentActivity } from '@heroarc/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, orpc } from '../../lib/orpc';
import { useDashboard } from '../board/DashboardContext';
import { cx } from '../board/lib';
import u from '../board/ui.module.css';
import { type ActKind, ReceiptRow } from '../coach/ReceiptRow';
import s from './Connections.module.css';

/** "5 min ago", "3 h ago", "2 days ago". */
function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** How to point each tool at HeroArc. */
function Setup({ apiUrl, secret }: { apiUrl: string; secret: string }) {
  return (
    <div className={s.setup}>
      <h4>MCP (n8n, Hermes, Claude Code, Cursor…)</h4>
      <p className={u.note}>
        Server URL, with the key as a Bearer token. In n8n: an MCP Client Tool with Server Transport
        “HTTP Streamable” and Bearer Auth.
      </p>
      <code className={s.code}>{`${apiUrl}/mcp\nAuthorization: Bearer ${secret}`}</code>
      <p className={u.note}>Hermes (config.yaml):</p>
      <code className={s.code}>
        {`mcp_servers:\n  heroarc:\n    url: ${apiUrl}/mcp\n    headers:\n      Authorization: "Bearer ${secret}"`}
      </code>
      <p className={u.note}>Claude Code:</p>
      <code className={s.code}>
        {`claude mcp add --transport http heroarc ${apiUrl}/mcp \\\n  --header "Authorization: Bearer ${secret}"`}
      </code>
      <h4>Hermes (the original API)</h4>
      <p className={u.note}>
        Same routes as before (GET /today, POST /food, /weight, /training); only the address and key
        change.
      </p>
      <code className={s.code}>{`Base URL: ${apiUrl}\nAuthorization: Bearer ${secret}`}</code>
      <h4>n8n, scripts, GPT actions (REST)</h4>
      <p className={u.note}>Import the OpenAPI document, or call a tool directly:</p>
      <code className={s.code}>{`${apiUrl}/api/agent/v1/openapi.json`}</code>
      <code className={s.code}>
        {`curl -X POST ${apiUrl}/api/agent/v1/tools/log_weight \\\n  -H "Authorization: Bearer ${secret}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"lb": 150.2}'`}
      </code>
    </div>
  );
}

/** Settings → Connections: API keys for outside agents. */
export function ConnectionsSection() {
  const qc = useQueryClient();
  const q = useQuery({ ...orpc.connections.list.queryOptions(), retry: false });
  const [name, setName] = useState('');
  const [made, setMade] = useState<{ name: string; secret: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!q.data) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: orpc.connections.list.queryKey() });

  return (
    <>
      <div className={u.caps}>Connections</div>
      <p className={u.note}>
        Let Claude, ChatGPT, n8n, Hermes or your own scripts log for you. New entries apply at once
        (you can undo them); edits and deletes wait for your OK under Agent activity. Oura data
        (sleep, readiness, steps…) is never shared with them.
      </p>
      <div className={s.setup}>
        <h4>Claude, ChatGPT and other apps that sign in</h4>
        <p className={u.note}>
          Add a custom connector (in Claude: Settings → Connectors) with this URL, then sign in to
          HeroArc and choose Allow. No key needed.
        </p>
        <code className={s.code} data-mcp-url="1">{`${q.data.apiUrl}/mcp`}</code>
      </div>
      {q.data.apps.length > 0 && (
        <div className={s.list}>
          {q.data.apps.map((a) => (
            <div className={u.row} key={a.clientId} data-app={a.name}>
              <span>
                <b>{a.name}</b>
                <span className={u.muted}>
                  {`${a.host ? ` · ${a.host}` : ''} · connected ${ago(a.connectedAt)}`}
                </span>
              </span>
              <button
                type="button"
                className={u.link}
                onClick={async () => {
                  await api.connections.disconnectApp({ clientId: a.clientId });
                  void refresh();
                }}
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}
      <h4 className={s.subhead}>API keys (n8n, Hermes, Claude Code, scripts)</h4>
      <form
        className={u.inline}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const r = await api.connections.createKey({ name: name.trim() });
            setMade({ name: r.key.name, secret: r.secret });
            setName('');
            void refresh();
          } catch (err) {
            setError((err as Error).message || "Couldn't create the key.");
          }
          setBusy(false);
        }}
      >
        <input
          className={u.input}
          placeholder="Name it (e.g. Hermes)"
          aria-label="Key name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit" className={u.primary} disabled={busy} data-new-key="1">
          Create key
        </button>
      </form>
      {error && (
        <p className={u.note} role="alert">
          {error}
        </p>
      )}
      {made && (
        <div className={s.secret} data-new-key-panel="1">
          <p className={u.note}>
            <b>{`Copy the key for ${made.name} now.`}</b> It won't be shown again.
          </p>
          <code className={s.code} data-key-secret="1">
            {made.secret}
          </code>
          <div className={u.inline}>
            <button
              type="button"
              className={cx(u.btn, u.small)}
              onClick={() => void navigator.clipboard?.writeText(made.secret)}
            >
              Copy key
            </button>
            <button type="button" className={cx(u.btn, u.small)} onClick={() => setMade(null)}>
              Done
            </button>
          </div>
          <Setup apiUrl={q.data.apiUrl} secret={made.secret} />
        </div>
      )}
      <div className={s.list}>
        {q.data.keys.map((k) => (
          <div className={u.row} key={k.id} data-key={k.name}>
            <span>
              <b>{k.name}</b>
              <span className={u.muted}>
                {` · ${k.prefix}… · ${k.lastUsedAt ? `used ${ago(k.lastUsedAt)}` : 'not used yet'}`}
              </span>
            </span>
            <button
              type="button"
              className={u.link}
              onClick={async () => {
                await api.connections.revokeKey({ id: k.id });
                void refresh();
              }}
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
      {!made && (
        <details className={s.setup}>
          <summary>How to connect a tool</summary>
          <Setup apiUrl={q.data.apiUrl} secret="<your key>" />
        </details>
      )}
    </>
  );
}

/** How many agent proposals are waiting (checked every minute). */
export function usePendingActivity(): number {
  const q = useQuery({
    ...orpc.activity.list.queryOptions(),
    refetchInterval: 60_000,
    retry: false,
  });
  return q.data?.pending.length ?? 0;
}

/** Settings → Agent activity: apply or decline proposals, undo what agents did. */
export function ActivitySection() {
  const qc = useQueryClient();
  const { reload } = useDashboard();
  const q = useQuery({ ...orpc.activity.list.queryOptions(), retry: false });
  if (!q.data || (q.data.pending.length === 0 && q.data.recent.length === 0)) return null;

  const act = (a: AgentActivity) => async (kind: ActKind) => {
    try {
      const r = await api.activity[kind]({ id: a.actionId });
      if (r.changed.includes('data')) await reload();
      if (r.changed.includes('layout'))
        await qc.invalidateQueries({ queryKey: orpc.layout.get.queryKey() });
    } finally {
      await qc.invalidateQueries({ queryKey: orpc.activity.list.queryKey() });
    }
  };
  const row = (a: AgentActivity) => (
    <ReceiptRow key={a.actionId} r={a} act={act(a)} meta={`${a.agent} · ${ago(a.at)}`} />
  );

  return (
    <>
      <div className={u.caps}>Agent activity</div>
      {q.data.pending.length > 0 && (
        <div className={s.list} data-activity="pending">
          <p className={u.note}>
            <b>{`Waiting for you (${q.data.pending.length})`}</b>
          </p>
          {q.data.pending.map(row)}
        </div>
      )}
      {q.data.recent.length > 0 && (
        <div className={s.list} data-activity="recent">
          <p className={u.note}>Recent</p>
          {q.data.recent.slice(0, 10).map(row)}
        </div>
      )}
    </>
  );
}
