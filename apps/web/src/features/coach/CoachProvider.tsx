import type { AppAction, ChatSummary, CoachEvent, Receipt } from '@heroarc/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, orpc } from '../../lib/orpc';
import { sendMessage } from './coach-client';
import type { CoachAudio, CoachImage, LiveMessage } from './types';

export interface Draft {
  text: string;
  images: CoachImage[];
  audio?: CoachAudio;
}

type Changed = Array<'data' | 'layout' | 'notes'>;

interface CoachValue {
  /** Coach is set up on the server (and voice notes are). */
  enabled: boolean;
  voice: boolean;
  chatId: string | null;
  messages: LiveMessage[];
  busy: boolean;
  send: (d: Draft) => Promise<void>;
  /** Apply / Cancel a proposed change, or Undo something done. */
  act: (actionId: string, kind: 'confirm' | 'cancel' | 'undo') => Promise<void>;
  newChat: () => void;
  openChat: (id: string) => Promise<void>;
  chats: ChatSummary[];
  refreshChats: () => void;
  /** Make Coach visible (expand the column or open the sheet) and focus the message box. */
  focus: () => void;
  setFocusTarget: (fn: (() => void) | null) => void;
}

const Ctx = createContext<CoachValue | null>(null);

export function useCoach(): CoachValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCoach outside CoachProvider');
  return v;
}

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

const localId = () => `local-${Math.random().toString(36).slice(2, 10)}`;

/**
 * The Coach conversation, shared by the desktop column and the phone sheet. Chats are saved
 * on the server: this opens the most recent one. `/` anywhere (outside a text box) opens
 * Coach with the cursor in its message box.
 */
export function CoachProvider({
  open,
  onApp,
  onChanged,
  children,
}: {
  /** Show Coach (expand the column or open the sheet). */
  open: () => void;
  /** Coach acted in the app: show a day, switch theme, open a card. */
  onApp: (a: AppAction) => void;
  /** Data, layout or notes changed on the server. */
  onChanged: (what: Changed) => void;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const status = useQuery({ ...orpc.coach.status.queryOptions(), staleTime: 60_000 });
  const chatsQuery = useQuery({ ...orpc.coach.chats.queryOptions(), staleTime: 30_000 });
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const focusTarget = useRef<(() => void) | null>(null);
  const loaded = useRef(false);
  const cb = useRef({ open, onApp, onChanged });
  cb.current = { open, onApp, onChanged };

  /** Bumped by every open / new chat, so a slow load can't replace a newer choice. */
  const seq = useRef(0);
  const openChat = useCallback(async (id: string) => {
    const mine = ++seq.current;
    const chat = await api.coach.chat({ id });
    if (mine !== seq.current) return;
    setChatId(chat.id);
    setMessages(chat.messages);
  }, []);

  // Continue the most recent chat (on any device).
  useEffect(() => {
    if (loaded.current || !chatsQuery.data) return;
    loaded.current = true;
    const latest = chatsQuery.data[0];
    if (latest) void openChat(latest.id).catch(() => {});
  }, [chatsQuery.data, openChat]);

  const focus = useCallback(() => {
    // Focus now if the message box is on screen (so typing right away isn't lost),
    // and again once a collapsed column or a sheet has opened.
    focusTarget.current?.();
    cb.current.open();
    setTimeout(() => focusTarget.current?.(), 60);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus]);

  const changed = useCallback(
    (what: Changed) => {
      if (what.includes('notes'))
        void qc.invalidateQueries({ queryKey: orpc.coach.notes.queryKey() });
      cb.current.onChanged(what);
    },
    [qc],
  );

  const setReceipt = useCallback((r: Receipt) => {
    setMessages((ms) =>
      ms.map((m) =>
        m.receipts?.some((x) => x.actionId === r.actionId)
          ? { ...m, receipts: m.receipts.map((x) => (x.actionId === r.actionId ? r : x)) }
          : m,
      ),
    );
  }, []);

  const send = useCallback(
    async (d: Draft) => {
      const text = d.text.trim();
      if (busy || (!text && !d.images.length && !d.audio)) return;
      const mineId = localId();
      const replyId = localId();
      const now = new Date().toISOString();
      setMessages((ms) => [
        ...ms,
        {
          id: mineId,
          role: 'user',
          text,
          thumbs: d.images.map((i) => i.thumb),
          ...(d.audio && { audioUrl: d.audio.url, voice: { ms: d.audio.ms, transcript: '' } }),
          at: now,
        },
        { id: replyId, role: 'coach', text: '', pending: true, at: now },
      ]);
      setBusy(true);
      const update = (fn: (m: LiveMessage) => LiveMessage) =>
        setMessages((ms) => ms.map((m) => (m.id === replyId ? fn(m) : m)));
      const handle = (ev: CoachEvent) => {
        switch (ev.type) {
          case 'start':
            setChatId(ev.chatId);
            // Keep this device's previews and playback; take the saved ids and transcript.
            setMessages((ms) =>
              ms.map((m) =>
                m.id === mineId ? { ...ev.message, thumbs: m.thumbs, audioUrl: m.audioUrl } : m,
              ),
            );
            break;
          case 'text':
            update((m) => ({ ...m, text: m.text + ev.delta, status: undefined }));
            break;
          case 'status':
            update((m) => ({ ...m, status: ev.text }));
            break;
          case 'receipt':
            update((m) => ({ ...m, receipts: [...(m.receipts ?? []), ev.receipt] }));
            break;
          case 'app':
            cb.current.onApp(ev.action);
            break;
          case 'changed':
            changed(ev.what);
            break;
          case 'error':
            update((m) => ({ ...m, error: ev.message }));
            break;
          case 'done':
            update((m) => ({
              ...m,
              ...ev.message,
              // Statuses may have moved on (e.g. undone) while the reply finished.
              receipts: m.receipts ?? ev.message.receipts,
              pending: false,
              status: undefined,
            }));
            break;
        }
      };
      try {
        for await (const ev of sendMessage({
          ...(chatId && { chatId }),
          text,
          images: d.images.map((i) => i.blob).filter((b): b is Blob => !!b),
          ...(d.audio?.blob && { audio: d.audio.blob, audioMs: d.audio.ms }),
        }))
          handle(ev);
      } catch {
        update((m) => ({
          ...m,
          error: "Couldn't reach Coach. Check your connection and try again.",
        }));
      }
      update((m) => ({ ...m, pending: false, status: undefined }));
      setBusy(false);
      void qc.invalidateQueries({ queryKey: orpc.coach.chats.queryKey() });
    },
    [busy, chatId, changed, qc],
  );

  const act = useCallback(
    async (actionId: string, kind: 'confirm' | 'cancel' | 'undo') => {
      try {
        const r = await api.coach[kind]({ id: actionId });
        setReceipt(r.receipt);
        changed(r.changed);
      } catch {
        setMessages((ms) =>
          ms.map((m) =>
            m.receipts?.some((x) => x.actionId === actionId)
              ? {
                  ...m,
                  error: "That couldn't be done (it may have changed since). Ask Coach again.",
                }
              : m,
          ),
        );
      }
    },
    [changed, setReceipt],
  );

  const value = useMemo<CoachValue>(
    () => ({
      enabled: status.data?.enabled ?? true,
      voice: status.data?.voice ?? false,
      chatId,
      messages,
      busy,
      send,
      act,
      newChat: () => {
        seq.current++;
        loaded.current = true;
        setChatId(null);
        setMessages([]);
      },
      openChat,
      chats: chatsQuery.data ?? [],
      refreshChats: () => void chatsQuery.refetch(),
      focus,
      setFocusTarget: (fn) => {
        focusTarget.current = fn;
      },
    }),
    [status.data, chatId, messages, busy, send, act, openChat, chatsQuery, focus],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
