import type { AppAction, CardId, Layout, Tile } from '@heroarc/contracts';
import { DEFAULT_LAYOUT } from '@heroarc/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { orpc } from '../../lib/orpc';
import { isThemeId } from '../../themes/registry';
import { useTheme } from '../../themes/ThemeProvider';
import { authClient } from '../account/auth-client';
import { bareClass, CoachColumn, CoachPanel } from '../coach/CoachPanel';
import { CoachProvider } from '../coach/CoachProvider';
import s from './Board.module.css';
import { CustomizeFooter, CustomizeList, CustomizePanel } from './Customize';
import { BOARD_CARDS } from './cards';
import { DashboardProvider, useDashboard, useToastState } from './DashboardContext';
import { Dock } from './Dock';
import { Grid } from './Grid';
import { Header } from './Header';
import { cx } from './lib';
import { requestOpenCard } from './openCard';
import { SettingsSheet } from './Settings';
import { Sheet } from './Sheet';
import { useBoardLayout } from './useBoardLayout';
import { useBreakpoint } from './useBreakpoint';

type Toast = ReturnType<typeof useToastState>;

const COACH_COLLAPSED = 'heroarc_coach_collapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COACH_COLLAPSED) === '1';
  } catch {
    return false;
  }
};

/** The HeroArc board: the account's layout of cards for the selected day. */
export function BoardPage() {
  // Signed in and onboarded, or off to sign-in / onboarding.
  const nav = useNavigate();
  const session = authClient.useSession();
  const signedIn = !!session.data;
  const me = useQuery({ ...orpc.account.me.queryOptions(), enabled: signedIn, retry: false });
  useEffect(() => {
    if (!session.isPending && !session.data) void nav({ to: '/sign-in' });
    else if (me.data && !me.data.onboarded) void nav({ to: '/onboarding' });
  }, [session.isPending, session.data, me.data, nav]);
  const ready = signedIn && !!me.data?.onboarded;

  const snapshot = useQuery({
    ...orpc.legacy.data.queryOptions(),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    enabled: ready,
  });
  const { layout, save, isError } = useBoardLayout(ready);
  const toast = useToastState();

  // Installable app: the service worker keeps the last page and data for offline starts.
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  if (!snapshot.data || !layout)
    return (
      <div className={s.loading} role="status">
        {snapshot.isError || isError
          ? "Couldn't load your data. Check your connection and reload."
          : 'Loading…'}
      </div>
    );
  return (
    <DashboardProvider data={snapshot.data} toast={toast.show}>
      <Board layout={layout} save={save} toast={toast} />
    </DashboardProvider>
  );
}

function Board({
  layout,
  save,
  toast,
}: {
  layout: Layout;
  save: (l: Layout) => Promise<boolean>;
  toast: Toast;
}) {
  const bp = useBreakpoint();
  /** The layout being customized (null when not customizing). */
  const [draft, setDraft] = useState<Layout | null>(null);
  const [settings, setSettings] = useState(false);
  const editing = draft != null;
  const tiles = (draft ?? layout).tiles;

  const start = () => setDraft(structuredClone(layout));
  const cancel = () => setDraft(null);
  const done = async () => {
    const d = draft;
    setDraft(null);
    if (!d) return;
    toast.show(
      (await save(d))
        ? 'Layout saved.'
        : "Couldn't save your layout. Check your connection and try again.",
    );
  };
  const update = (next: Tile[]) => setDraft((d) => (d ? { ...d, tiles: next } : d));
  const hide = (id: CardId) => update(tiles.map((t) => (t.id === id ? { ...t, hidden: true } : t)));
  const reset = () => setDraft(structuredClone(DEFAULT_LAYOUT));
  const panel = editing && bp === 'board';

  // Coach: a column on desktop (collapsible, remembered on this device), a sheet elsewhere.
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try {
      localStorage.setItem(COACH_COLLAPSED, v ? '1' : '0');
    } catch {}
  };
  const [coachSheet, setCoachSheet] = useState(false);
  const openCoach = () => (bp === 'board' ? setCollapsed(false) : setCoachSheet(true));

  // What Coach does in the app, and what it changed on the server.
  const { setSel, reload } = useDashboard();
  const { setTheme } = useTheme();
  const qc = useQueryClient();
  const onApp = (a: AppAction) => {
    if (a.kind === 'show_day') setSel(a.date);
    else if (a.kind === 'set_theme') {
      if (isThemeId(a.theme)) setTheme(a.theme);
    } else {
      // On phones and tablets Coach covers the board: step aside so the card shows.
      if (bp !== 'board') setCoachSheet(false);
      setTimeout(() => requestOpenCard(a.card, a.view), bp !== 'board' ? 250 : 0);
    }
  };
  const onChanged = (what: Array<'data' | 'layout' | 'notes'>) => {
    if (what.includes('data')) void reload();
    if (what.includes('layout'))
      void qc.invalidateQueries({ queryKey: orpc.layout.get.queryKey() });
  };
  const column = bp === 'board' && !panel;

  return (
    <CoachProvider open={openCoach} onApp={onApp} onChanged={onChanged}>
      <div className={cx(s.page, panel && s.withPanel)}>
        <div className={cx(s.body, column && s.withCoach)}>
          {/* Coach comes first (keyboard order) and runs the full height beside header and board. */}
          {column && <CoachColumn collapsed={collapsed} setCollapsed={setCollapsed} />}
          <div className={s.board}>
            <Header
              editing={editing}
              onCustomize={() => (editing ? void done() : start())}
              onSettings={() => setSettings(true)}
              onCoach={bp === 'two' ? () => setCoachSheet(true) : undefined}
            />
            <main className={s.main}>
              <Grid
                bp={bp}
                tiles={tiles}
                editing={panel}
                onChange={update}
                onHide={hide}
                title={(id) => BOARD_CARDS[id].title}
                render={(id) => {
                  const C = BOARD_CARDS[id].Component;
                  return <C />;
                }}
              />
            </main>
          </div>
        </div>
        {bp !== 'board' && (
          <Sheet open={coachSheet} onClose={() => setCoachSheet(false)} title="Coach" fill>
            <div className={bareClass} style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
              <CoachPanel />
            </div>
          </Sheet>
        )}
        {panel && (
          <CustomizePanel
            tiles={tiles}
            onChange={update}
            onReset={reset}
            onCancel={cancel}
            onDone={() => void done()}
          />
        )}
        {bp !== 'board' && (
          <Sheet
            open={editing}
            onClose={cancel}
            title="Customize"
            footer={
              <CustomizeFooter onReset={reset} onCancel={cancel} onDone={() => void done()} />
            }
          >
            <CustomizeList tiles={tiles} onChange={update} board={false} />
          </Sheet>
        )}
        {bp === 'one' && <Dock onCoach={() => setCoachSheet(true)} />}
        <SettingsSheet open={settings} onClose={() => setSettings(false)} onCustomize={start} />
        <div
          className={cx(s.toast, toast.on && s.toastOn)}
          role="status"
          aria-live="polite"
          data-toast="1"
        >
          {toast.text}
        </div>
      </div>
    </CoachProvider>
  );
}
