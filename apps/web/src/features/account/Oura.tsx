import type { OuraStatus } from '@heroarc/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, orpc } from '../../lib/orpc';
import { snapshotKey, useDashboard } from '../board/DashboardContext';
import { cx } from '../board/lib';
import u from '../board/ui.module.css';

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

/** The account's Oura connection. While the first sync runs, it checks every few seconds. */
export function useOuraStatus() {
  return useQuery({
    ...orpc.oura.status.queryOptions(),
    retry: false,
    staleTime: 30_000,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d?.connected && d.status === 'ok' && !d.lastSyncAt ? 3000 : false;
    },
  });
}

/** Start connecting: Oura's sign-in page, which returns to HeroArc. */
async function connect(returnTo: 'settings' | 'onboarding') {
  const { url } = await api.oura.connect({ returnTo });
  window.location.assign(url);
}

/** Connect, status, Sync now and Disconnect: Settings → Oura, and onboarding's last step. */
export function OuraPanel({ returnTo }: { returnTo: 'settings' | 'onboarding' }) {
  const qc = useQueryClient();
  const q = useOuraStatus();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  const st = q.data;
  if (!st?.available) return null;

  const set = (s: OuraStatus) => qc.setQueryData(orpc.oura.status.queryKey(), s);
  const refreshBoard = () => qc.invalidateQueries({ queryKey: snapshotKey() });
  const go = async () => {
    setBusy(true);
    setMsg('');
    try {
      await connect(returnTo);
    } catch {
      setBusy(false);
      setMsg("Couldn't start connecting. Try again.");
    }
  };
  const syncNow = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.oura.sync();
      set(r);
      await refreshBoard();
      setMsg(r.status === 'ok' ? `Synced ${r.days} day${r.days === 1 ? '' : 's'}.` : '');
    } catch {
      setMsg("Couldn't reach Oura. HeroArc will try again on its own.");
    }
    setBusy(false);
  };
  const disconnect = async () => {
    setBusy(true);
    await api.oura.disconnect();
    setConfirm(false);
    setBusy(false);
    await qc.invalidateQueries({ queryKey: orpc.oura.status.queryKey() });
    await refreshBoard();
  };

  const connectButton = (label: string) => (
    <button
      type="button"
      className={u.primary}
      disabled={busy}
      data-oura-connect="1"
      onClick={() => void go()}
    >
      {label}
    </button>
  );

  return (
    <div className={u.stack} data-oura={st.connected ? (st.status ?? 'ok') : 'off'}>
      {!st.connected ? (
        <>
          <p className={u.note}>
            Connect your Oura ring to see sleep, readiness, HRV, resting heart rate, steps and
            stress on your dashboard. HeroArc fetches your history, then keeps it up to date. Coach
            and connected AI tools never see it.
          </p>
          <div>{connectButton('Connect Oura')}</div>
        </>
      ) : st.status === 'reconnect' ? (
        <>
          <p className={u.note} role="alert">
            Oura stopped accepting HeroArc's connection (it was revoked or expired). Connect again
            to keep syncing; nothing already synced is lost.
          </p>
          <div>{connectButton('Connect Oura again')}</div>
        </>
      ) : (
        <>
          <p className={u.note} data-oura-state="1">
            {!st.lastSyncAt
              ? 'Connected. Fetching your Oura history…'
              : `Connected · synced ${ago(st.lastSyncAt)}${st.syncedFrom ? ` · history from ${st.syncedFrom}` : ''}`}
            {st.status === 'error' && ' · the last sync failed; HeroArc retries every 30 minutes.'}
          </p>
          {st.missingScopes.length > 0 && (
            <p className={u.note}>
              {`Oura didn't share ${st.missingScopes.join(' and ')} data. To include it, disconnect and connect again, leaving it ticked on Oura's page.`}
            </p>
          )}
          {confirm ? (
            <div className={u.inline}>
              <span className={u.note}>Disconnect and delete the Oura data HeroArc stored?</span>
              <button
                type="button"
                className={cx(u.btn, u.small)}
                onClick={() => setConfirm(false)}
              >
                Keep
              </button>
              <button
                type="button"
                className={cx(u.primary, u.small)}
                disabled={busy}
                data-oura-disconnect-confirm="1"
                onClick={() => void disconnect()}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className={u.inline}>
              <button
                type="button"
                className={cx(u.btn, u.small)}
                disabled={busy || !st.lastSyncAt}
                data-oura-sync="1"
                onClick={() => void syncNow()}
              >
                Sync now
              </button>
              <button
                type="button"
                className={u.link}
                data-oura-disconnect="1"
                onClick={() => setConfirm(true)}
              >
                Disconnect
              </button>
            </div>
          )}
        </>
      )}
      {msg && (
        <p className={u.note} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

/** Settings → Oura (hidden when the server has no Oura application). */
export function OuraSection() {
  const q = useOuraStatus();
  if (!q.data?.available) return null;
  return (
    <>
      <div className={u.caps}>Oura</div>
      <OuraPanel returnTo="settings" />
    </>
  );
}

const RETURN_MESSAGES: Record<string, string> = {
  connected: 'Oura connected. Fetching your history…',
  cancelled: "Oura wasn't connected.",
  expired: 'That took too long. Connect Oura again from Settings.',
  error: "Couldn't connect Oura. Try again from Settings.",
};

/**
 * Back on the board from Oura's sign-in (?oura=…): say how it went, tidy the address, and once
 * the first sync is done reload the dashboard.
 */
export function useOuraReturn() {
  const { toast, reload } = useDashboard();
  const status = useOuraStatus();
  const waiting = useRef(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const result = p.get('oura');
    if (!result) return;
    p.delete('oura');
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    toast(RETURN_MESSAGES[result] ?? RETURN_MESSAGES.error ?? '');
    waiting.current = result === 'connected';
  }, [toast]);
  useEffect(() => {
    if (waiting.current && status.data?.lastSyncAt) {
      waiting.current = false;
      void reload();
      toast('Your Oura history is in.');
    }
  }, [status.data?.lastSyncAt, reload, toast]);
}
