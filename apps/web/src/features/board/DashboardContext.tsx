import type { Snapshot } from '@heroarc/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, orpc } from '../../lib/orpc';
import { useTheme } from '../../themes/ThemeProvider';
import type { ThemeDefinition, ThemeId } from '../../themes/types';

interface DashboardValue {
  data: Snapshot;
  /** Selected day ('YYYY-MM-DD'). */
  sel: string;
  setSel: (d: string) => void;
  /** Today in the user's timezone (from the snapshot). */
  today: string;
  isToday: boolean;
  /** Earliest day with data (the date picker's minimum). */
  minDay: string;
  /** Change the cached snapshot locally (optimistic update); `fn` mutates a copy. */
  patch: (fn: (draft: Snapshot) => void) => void;
  /** Re-read the snapshot from the API. */
  reload: () => Promise<Snapshot | undefined>;
  toast: (msg: string) => void;
  themeId: ThemeId;
  theme: ThemeDefinition;
  api: typeof api;
}

const Ctx = createContext<DashboardValue | null>(null);

export function useDashboard(): DashboardValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDashboard outside DashboardProvider');
  return v;
}

export const snapshotKey = () => orpc.legacy.data.queryKey();

export function DashboardProvider({
  data,
  toast,
  children,
}: {
  data: Snapshot;
  toast: (msg: string) => void;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const { id: themeId, theme } = useTheme();
  const today = data.date;
  const minDay = useMemo(() => Object.keys(data.days).sort()[0] ?? today, [data.days, today]);

  const [selRaw, setSelRaw] = useState<string>(today);
  // Clamp like the original: never after today, never before the first day with data.
  let sel = selRaw;
  if (sel > today) sel = today;
  if (sel < minDay) sel = minDay;
  const setSel = useCallback((d: string) => setSelRaw(d), []);

  const patch = useCallback(
    (fn: (draft: Snapshot) => void) => {
      qc.setQueryData<Snapshot>(snapshotKey(), (old) => {
        if (!old) return old;
        const next = structuredClone(old);
        fn(next);
        return next;
      });
    },
    [qc],
  );

  const reload = useCallback(
    () => qc.fetchQuery({ ...orpc.legacy.data.queryOptions(), staleTime: 0 }),
    [qc],
  );

  const value = useMemo<DashboardValue>(
    () => ({
      data,
      sel,
      setSel,
      today,
      isToday: sel === today,
      minDay,
      patch,
      reload,
      toast,
      themeId,
      theme,
      api,
    }),
    [data, sel, setSel, today, minDay, patch, reload, toast, themeId, theme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Toast state: a message shows for 1.9 s. */
export function useToastState(): { text: string; on: boolean; show: (msg: string) => void } {
  const [text, setText] = useState('');
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((msg: string) => {
    setText(msg);
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 1900);
  }, []);
  return { text, on, show };
}
