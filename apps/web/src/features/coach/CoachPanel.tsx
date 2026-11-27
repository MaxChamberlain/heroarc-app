import type { Receipt } from '@heroarc/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, orpc } from '../../lib/orpc';
import { CollapseIcon, SparkIcon } from '../board/icons';
import { cx } from '../board/lib';
import { Sheet } from '../board/Sheet';
import u from '../board/ui.module.css';
import s from './Coach.module.css';
import { useCoach } from './CoachProvider';
import { Composer } from './Composer';
import { photoUrl } from './coach-client';
import { Markdown } from './Markdown';
import { ReceiptRow } from './ReceiptRow';
import type { LiveMessage } from './types';
import { clockOf } from './useRecorder';

const STARTERS = [
  'I had two eggs and toast for breakfast',
  'How did I sleep this week compared to last?',
  'Move Training to the top of my dashboard',
];

/** Class for a container that frames the panel itself (e.g. a Sheet). */
export const bareClass = s.bare;

/** The conversation, its toolbar (new chat, past chats, notes) and the composer. */
export function CoachPanel({ onCollapse }: { onCollapse?: () => void }) {
  const { messages, send, busy, enabled } = useCoach();
  const panel = useRef<HTMLElement>(null);
  const thread = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the thread changes.
  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <section className={s.panel} ref={panel} aria-label="Coach">
      <header className={s.head}>
        <span className={s.mark} aria-hidden="true">
          <SparkIcon size={18} />
        </span>
        <div>
          <h2>Coach</h2>
          <small>Text, photos or a voice note</small>
        </div>
        <Toolbar />
        {onCollapse && (
          <button
            type="button"
            className={s.headBtn}
            aria-label="Collapse Coach"
            onClick={onCollapse}
          >
            <CollapseIcon />
          </button>
        )}
      </header>
      <div
        className={s.thread}
        ref={thread}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {!enabled ? (
          <div className={s.intro}>
            <p>
              <b>Coach isn't set up yet.</b> Add an <code>ANTHROPIC_API_KEY</code> (and an{' '}
              <code>OPENAI_API_KEY</code> for voice notes) to the server's environment, then restart
              it.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className={s.intro}>
            <p>
              <b>Hi, I'm Coach.</b> Tell me what you ate, snap your plate, or send a voice note and
              I'll log it. I can fix past entries, answer questions about your history, and
              rearrange your dashboard.
            </p>
            <div className={s.starters}>
              {STARTERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={busy}
                  onClick={() => void send({ text: t, images: [] })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
      </div>
      <Composer dropTarget={panel} />
    </section>
  );
}

/** New chat · past chats · what Coach remembers. */
function Toolbar() {
  const { newChat, openChat, chats, chatId, refreshChats, busy } = useCoach();
  const [menu, setMenu] = useState(false);
  const [notes, setNotes] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const off = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [menu]);

  return (
    <div className={s.tools2} ref={wrap}>
      <button
        type="button"
        className={s.headBtn}
        aria-label="Chats and notes"
        aria-expanded={menu}
        data-coach-menu="1"
        onClick={() => {
          if (!menu) refreshChats();
          setMenu(!menu);
        }}
      >
        ⋯
      </button>
      {menu && (
        <div className={s.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            data-new-chat="1"
            onClick={() => {
              newChat();
              setMenu(false);
            }}
          >
            New chat
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setNotes(true);
              setMenu(false);
            }}
          >
            What Coach remembers
          </button>
          {chats.length > 0 && <div className={s.menuHead}>Past chats</div>}
          {chats.slice(0, 12).map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              aria-current={c.id === chatId || undefined}
              disabled={busy}
              onClick={() => {
                void openChat(c.id);
                setMenu(false);
              }}
            >
              <span>{c.title}</span>
              <small>
                {new Date(c.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </small>
            </button>
          ))}
        </div>
      )}
      <NotesSheet open={notes} onClose={() => setNotes(false)} />
    </div>
  );
}

/** What Coach remembers about you, with Forget. */
function NotesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const notes = useQuery({ ...orpc.coach.notes.queryOptions(), enabled: open });
  return (
    <Sheet open={open} onClose={onClose} title="What Coach remembers">
      <div className={u.stack}>
        <p className={u.note}>
          Coach reads these in every chat. It adds one when you share something worth remembering;
          you can ask it to forget, or remove one here.
        </p>
        {notes.data?.length === 0 && <p className={u.note}>Nothing yet.</p>}
        {notes.data?.map((n) => (
          <div className={u.row} key={n.id} data-note={n.id}>
            <span>{n.text}</span>
            <button
              type="button"
              className={u.link}
              onClick={async () => {
                await api.coach.deleteNote({ id: n.id });
                await qc.invalidateQueries({ queryKey: orpc.coach.notes.queryKey() });
              }}
            >
              Forget
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function Bubble({ m }: { m: LiveMessage }) {
  const photos = m.thumbs?.length ? m.thumbs : (m.images ?? []).map(photoUrl);
  return (
    <div className={cx(s.bubble, m.role === 'user' ? s.mine : s.theirs)} data-role={m.role}>
      {photos.length > 0 && (
        <div className={s.photos}>
          {photos.map((src) => (
            <img key={src} src={src} alt="Sent" />
          ))}
        </div>
      )}
      {m.voice &&
        (m.audioUrl ? (
          <span className={s.voice}>
            {/* biome-ignore lint/a11y/useMediaCaption: the user's own voice note (its transcript shows below). */}
            <audio controls src={m.audioUrl} />
            <small className={s.voiceLen}>{clockOf(m.voice.ms)}</small>
          </span>
        ) : (
          <small className={s.voiceGone}>{`Voice note · ${clockOf(m.voice.ms)}`}</small>
        ))}
      {m.voice?.transcript && <p className={s.transcript}>{`“${m.voice.transcript}”`}</p>}
      {m.text && (m.role === 'coach' ? <Markdown text={m.text} /> : <p>{m.text}</p>)}
      {m.pending && !m.text && (
        <span className={s.working}>
          <span className={s.typing} role="img" aria-label="Coach is writing">
            <i />
            <i />
            <i />
          </span>
          {m.status && <small data-coach-status="1">{m.status}</small>}
        </span>
      )}
      {m.receipts?.map((r) => (
        <CoachReceipt key={r.actionId} r={r} />
      ))}
      {m.error && (
        <p className={s.error} role="alert">
          {m.error}
        </p>
      )}
    </div>
  );
}

/** A receipt in the chat, settled through Coach (so it hears what you did). */
function CoachReceipt({ r }: { r: Receipt }) {
  const { act } = useCoach();
  return <ReceiptRow r={r} act={(kind) => act(r.actionId, kind)} />;
}

/** Desktop: Coach as an always-open column beside the board, collapsible to a slim rail. */
export function CoachColumn({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  if (collapsed)
    return (
      <aside className={s.rail} data-coach="rail">
        <button type="button" aria-label="Open Coach" onClick={() => setCollapsed(false)}>
          <SparkIcon />
          <span>Coach</span>
        </button>
      </aside>
    );
  return (
    <aside className={s.column} data-coach="column">
      <CoachPanel onCollapse={() => setCollapsed(true)} />
    </aside>
  );
}
