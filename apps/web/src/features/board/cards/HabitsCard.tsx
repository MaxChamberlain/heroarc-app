import type { HabitsSection } from '@heroarc/contracts';
import { useEffect, useRef, useState } from 'react';
import { Card } from '../Card';
import { useDashboard } from '../DashboardContext';
import { cx, dayLabel, eventId, noon, shift } from '../lib';
import { useOpenCard } from '../openCard';
import { Sheet } from '../Sheet';
import u from '../ui.module.css';
import h from './Habits.module.css';

const MAX_ACTIVE = 8;
const pad = (n: number) => String(n).padStart(2, '0');

/** Tick a habit on a day: shown at once, rolled back if the API refuses. */
function useHabitTap() {
  const { data, today, patch, toast, api } = useDashboard();
  const [pop, setPop] = useState<string | null>(null);
  const B = data.habits;
  const on = (hid: string, d: string) => !!B?.log[d]?.includes(hid);
  const tap = async (hid: string, d: string) => {
    if (d > today) return;
    const was = on(hid, d);
    const v = was ? 0 : 1;
    const set = (val: boolean) =>
      patch((s) => {
        if (!s.habits) return;
        const a = s.habits.log[d] ?? [];
        s.habits.log[d] = a;
        const i = a.indexOf(hid);
        if (val && i < 0) a.push(hid);
        if (!val && i >= 0) a.splice(i, 1);
        if (!a.length) delete s.habits.log[d];
      });
    set(!!v);
    setPop(v ? `${hid}|${d}` : null);
    try {
      await api.legacy.habits({ id: eventId('h'), d, h: hid, v });
    } catch {
      set(was);
      setPop(null);
      toast("Couldn't save that. Check your connection and tap again.");
    }
  };
  return { on, tap, pop };
}

/** Habits: a yes/no box per habit for the 7 days ending on the selected day. */
export function HabitsCard() {
  const { data, sel, today, isToday } = useDashboard();
  const { on, tap, pop } = useHabitTap();
  const [sheet, setSheet] = useState<'month' | 'trend' | 'edit' | null>(null);
  useOpenCard('habits', (v) =>
    setSheet(v === 'month' ? 'month' : v === 'trends' ? 'trend' : v === 'edit' ? 'edit' : null),
  );
  const B = data.habits;
  const list = B?.list ?? [];

  const sheets = B && (
    <>
      <Sheet open={sheet === 'month'} onClose={() => setSheet(null)} title="Habits this month" wide>
        <HabitsMonth habits={B} />
      </Sheet>
      <Sheet open={sheet === 'trend'} onClose={() => setSheet(null)} title="Habit trends">
        <HabitsTrend habits={B} today={today} />
      </Sheet>
      <Sheet open={sheet === 'edit'} onClose={() => setSheet(null)} title="Edit habits">
        <HabitsEditor habits={B} onClose={() => setSheet(null)} />
      </Sheet>
    </>
  );

  if (!list.length)
    return (
      <Card
        title="Habits"
        footer={
          <button type="button" className={u.btn} data-hedit="1" onClick={() => setSheet('edit')}>
            {B?.archived.length ? 'Edit habits' : 'Add habits'}
          </button>
        }
      >
        <p className={u.note}>
          {B?.archived.length ? 'All habits are hidden.' : 'No habits yet. Add your first.'}
        </p>
        {sheets}
      </Card>
    );

  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(shift(sel, -i));
  const ym = sel.slice(0, 7);
  const dim = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate();
  const upto = Math.min(dim, today.slice(0, 7) === ym ? Number(today.slice(8)) : dim);
  const monthCount = (hid: string) => {
    let n = 0;
    for (let d = 1; d <= upto; d++) if (on(hid, `${ym}-${pad(d)}`)) n++;
    return n;
  };
  const dn = list.filter((x) => on(x.id, sel)).length;
  const tot = list.length;
  const when = isToday ? 'Today' : dayLabel(sel, { month: 'short', day: 'numeric' });

  return (
    <Card
      title="Habits"
      footer={
        <>
          <button
            type="button"
            className={cx(u.btn, u.small)}
            data-hbm="1"
            onClick={() => setSheet('month')}
          >
            Month
          </button>
          <button
            type="button"
            className={cx(u.btn, u.small)}
            data-hbt="1"
            onClick={() => setSheet('trend')}
          >
            Trends
          </button>
          <button
            type="button"
            className={cx(u.btn, u.small)}
            data-hedit="1"
            onClick={() => setSheet('edit')}
          >
            Edit
          </button>
        </>
      }
    >
      {isToday && dn === tot && (
        <div className={u.done} style={{ marginBottom: 10 }}>
          ✓ All done today
        </div>
      )}
      <div className={h.grid}>
        <span />
        {days.map((d) => (
          <span key={d} className={cx(h.dayHead, d === sel && h.sel)}>
            {dayLabel(d, { weekday: 'narrow' })}
          </span>
        ))}
        <span className={h.count} title="This month">
          {new Date(`${ym}-01T12:00`).toLocaleDateString(undefined, { month: 'short' })}
        </span>
        {list.map((x) => [
          <span key={`n${x.id}`} className={h.name} title={x.n}>
            {x.n}
          </span>,
          ...days.map((d) => {
            const done = on(x.id, d);
            return (
              <button
                key={`${x.id}${d}`}
                type="button"
                className={cx(
                  h.box,
                  done && h.on,
                  d === sel && h.sel,
                  pop === `${x.id}|${d}` && h.pop,
                )}
                data-hb={`${x.id}|${d}`}
                disabled={d > today}
                aria-label={`${x.n} ${d}${done ? ' done' : ''}`}
                aria-pressed={done}
                onClick={() => void tap(x.id, d)}
              />
            );
          }),
          <span key={`c${x.id}`} className={h.count}>{`${monthCount(x.id)}/${upto}`}</span>,
        ])}
      </div>
      <div className={h.foot}>
        <span className={h.pips} aria-hidden="true">
          {list.map((x) => (
            <i key={x.id} className={on(x.id, sel) ? h.on : undefined} />
          ))}
        </span>
        <b>{`${when} ${dn} of ${tot}`}</b>
      </div>
      {sheets}
    </Card>
  );
}

/** Quick action (phone): big rows to tick off today's habits. */
export function HabitToggles() {
  const { data, today } = useDashboard();
  const { on, tap } = useHabitTap();
  const list = data.habits?.list ?? [];
  if (!list.length) return <p className={u.note}>No habits yet. Add them on the Habits card.</p>;
  return (
    <div className={h.toggleList}>
      {list.map((x) => {
        const done = on(x.id, today);
        return (
          <button
            key={x.id}
            type="button"
            className={h.toggle}
            aria-pressed={done}
            data-hq={x.id}
            onClick={() => void tap(x.id, today)}
          >
            {x.n}
            <span className={cx(h.box, done && h.on)} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** The selected month: one column per habit, one row per day. */
function HabitsMonth({ habits: B }: { habits: HabitsSection }) {
  const { sel, today } = useDashboard();
  const { on, tap } = useHabitTap();
  const ym = sel.slice(0, 7);
  const dim = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate();
  return (
    <>
      <p className={u.note} style={{ marginBottom: 10 }}>
        {`${new Date(`${ym}-01T12:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}. Tap a box to fix a day.`}
      </p>
      <div
        className={h.month}
        style={{ gridTemplateColumns: `28px repeat(${B.list.length}, minmax(22px, 1fr))` }}
      >
        <span />
        {B.list.map((x) => (
          <span key={x.id} className={h.colHead} title={x.n}>
            {x.n}
          </span>
        ))}
        {Array.from({ length: dim }, (_, i) => {
          const k = `${ym}-${pad(i + 1)}`;
          return [
            <span key={`d${k}`} className={h.dayNum}>
              {i + 1}
            </span>,
            ...B.list.map((x) => (
              <button
                key={`${x.id}${k}`}
                type="button"
                className={cx(h.cell, on(x.id, k) && h.on)}
                data-hb={`${x.id}|${k}`}
                disabled={k > today}
                aria-label={`${x.n} ${k}`}
                aria-pressed={on(x.id, k)}
                onClick={() => void tap(x.id, k)}
              />
            )),
          ];
        })}
      </div>
    </>
  );
}

/** Six-month share-of-days per habit, and the weekday pattern over the last 90 days. */
function HabitsTrend({ habits: B, today }: { habits: HabitsSection; today: string }) {
  const on = (hid: string, d: string) => !!B.log[d]?.includes(hid);
  const first = Object.keys(B.log).sort()[0] ?? today;
  const months: string[] = [];
  {
    let y = Number(today.slice(0, 4));
    let m = Number(today.slice(5, 7));
    for (let i = 0; i < 6; i++) {
      months.unshift(`${y}-${pad(m)}`);
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
    }
  }
  const cur = months[5] as string;
  const mon = (m: string) =>
    new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1)
      .toLocaleDateString(undefined, { month: 'short' })
      .slice(0, 3);
  const pct = (hid: string, ym: string) => {
    const dim = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate();
    let n = 0;
    let c = 0;
    for (let d = 1; d <= dim; d++) {
      const k = `${ym}-${pad(d)}`;
      if (k > today || k < first) continue;
      n++;
      if (on(hid, k)) c++;
    }
    return n ? c / n : null;
  };

  let n = 0;
  let c = 0;
  for (let d = 1; d <= Number(today.slice(8)); d++) {
    const k = `${cur}-${pad(d)}`;
    if (k < first) continue;
    for (const x of B.list) {
      n++;
      if (on(x.id, k)) c++;
    }
  }

  const from = shift(today, -89);
  const wd = [0, 0, 0, 0, 0, 0, 0];
  const wn = [0, 0, 0, 0, 0, 0, 0];
  let span = 0;
  for (let i = 0; i < 90; i++) {
    const k = shift(today, -i);
    if (k < from || k < first) continue;
    span++;
    const w = (noon(k).getDay() + 6) % 7;
    for (const x of B.list) {
      wn[w] = (wn[w] ?? 0) + 1;
      if (on(x.id, k)) wd[w] = (wd[w] ?? 0) + 1;
    }
  }
  const ratios = wd.map((v, i) => (wn[i] ? v / (wn[i] as number) : 0));
  const mx = Math.max(...ratios);
  const mn = Math.min(...ratios);
  const NM = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className={u.stack}>
      <p className={u.note}>
        {n ? (
          <>
            <b>{`${Math.round((c / n) * 100)}%`}</b>
            {` of boxes checked in ${mon(cur)} so far.`}
          </>
        ) : (
          'Not enough days yet.'
        )}{' '}
        Share of days done; days before your first check-in are not counted.
      </p>
      <div className={h.months}>
        <span />
        {months.map((m) => (
          <span key={m} className={h.mLabel}>
            {mon(m)}
          </span>
        ))}
        <span />
        {B.list.map((x) => {
          const p = months.map((m) => pct(x.id, m));
          const last = p[5] ?? null;
          const prev = p[4] ?? null;
          const d = last != null && prev != null ? Math.round((last - prev) * 100) : null;
          return [
            <span key={`n${x.id}`} className={h.name}>
              {x.n}
            </span>,
            ...p.map((v, i) =>
              v == null ? (
                <i key={`${x.id}${months[i]}`} className={cx(h.bar, h.na)} />
              ) : (
                <i
                  key={`${x.id}${months[i]}`}
                  className={cx(h.bar, i === 5 && h.cur)}
                  style={{ height: `${Math.max(2, Math.round(v * 26))}px` }}
                />
              ),
            ),
            <span key={`p${x.id}`} className={h.pct}>
              {last == null ? '—' : `${Math.round(last * 100)}%`}
              <small>
                {d == null
                  ? ''
                  : `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} vs ${mon(months[4] as string)}`}
              </small>
            </span>,
          ];
        })}
      </div>
      {span >= 21 && (
        <>
          <p className={u.note} style={{ marginTop: 8 }}>
            {`By weekday, last ${span} days: strongest `}
            <b>{NM[ratios.indexOf(mx)]}</b>
            {', quietest '}
            <b>{NM[ratios.indexOf(mn)]}</b>
          </p>
          <div className={h.week}>
            {ratios.map((v, i) => (
              <div key={NM[i]}>
                <i
                  className={v === mx ? h.hi : undefined}
                  style={{ height: `${Math.max(2, Math.round(v * 34))}px` }}
                />
                {'MTWTFSS'[i]}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface EditRow {
  id: string;
  n: string;
  a: 0 | 1;
  isNew?: boolean;
}

/** Add, rename, reorder, hide and restore habits (history is kept for hidden ones). */
function HabitsEditor({ habits: B, onClose }: { habits: HabitsSection; onClose: () => void }) {
  const { patch, toast, api } = useDashboard();
  const [rows, setRows] = useState<EditRow[]>(() => [
    ...B.list.map((x) => ({ id: x.id, n: x.n, a: 0 as const })),
    ...B.archived.map((x) => ({ id: x.id, n: x.n, a: 1 as const })),
  ]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const focusLast = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const activeN = rows.filter((r) => !r.a).length;

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    const inputs = box.current?.querySelectorAll<HTMLInputElement>('[data-hed]');
    inputs?.[inputs.length - 1]?.focus();
  });

  const lastActive = (rs: EditRow[]) => rs.map((x) => x.a).lastIndexOf(0);
  const rename = (i: number, n: string) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, n } : r)));
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const act = rs.map((_, k) => k).filter((k) => !rs[k]?.a);
      const q = act.indexOf(i) + dir;
      const j = act[q];
      if (q < 0 || j === undefined) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j] as EditRow, next[i] as EditRow];
      return next;
    });
  const hide = (i: number) => {
    if (activeN <= 1) {
      setMsg('Keep at least one habit visible.');
      return;
    }
    setRows((rs) => {
      const next = [...rs];
      const [r] = next.splice(i, 1);
      if (r) next.push({ ...r, a: 1 });
      return next;
    });
    setMsg('');
  };
  const restore = (i: number) => {
    if (activeN >= MAX_ACTIVE) return;
    setRows((rs) => {
      const next = [...rs];
      const [r] = next.splice(i, 1);
      if (r) next.splice(lastActive(next) + 1, 0, { ...r, a: 0 });
      return next;
    });
    setMsg('');
  };
  const add = () => {
    if (activeN >= MAX_ACTIVE) return;
    setRows((rs) => {
      const next = [...rs];
      next.splice(lastActive(next) + 1, 0, { id: '', n: '', a: 0, isNew: true });
      return next;
    });
    setMsg('');
    focusLast.current = true;
  };

  const newId = (name: string, taken: Set<string>) => {
    const base = (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'habit'
    ).slice(0, 24);
    let id = base;
    let i = 2;
    while (taken.has(id)) id = `${base}-${i++}`;
    taken.add(id);
    return id;
  };

  const save = async () => {
    if (rows.some((r) => !r.a && !r.n.trim())) {
      setMsg('Give every habit a name, or hide it.');
      return;
    }
    if (!activeN) {
      setMsg('Keep at least one habit visible.');
      return;
    }
    if (rows.some((r) => /^[=+@]/.test(r.n.trim()))) {
      setMsg('Names cannot start with = + or @.');
      return;
    }
    const taken = new Set([
      ...rows.map((r) => r.id),
      ...B.list.map((x) => x.id),
      ...B.archived.map((x) => x.id),
    ]);
    const final = rows.map((r) => (r.isNew && !r.id ? { ...r, id: newId(r.n.trim(), taken) } : r));
    const list = final.map((r) => ({ id: r.id, n: r.n.trim().slice(0, 30), a: r.a }));
    setRows(final);
    setBusy(true);
    setMsg('Saving…');
    try {
      await api.legacy.habitConfig({ id: eventId('c'), list });
      patch((s) => {
        if (!s.habits) return;
        s.habits.list = list.filter((x) => !x.a).map((x) => ({ id: x.id, n: x.n }));
        s.habits.archived = list.filter((x) => x.a).map((x) => ({ id: x.id, n: x.n }));
      });
      toast('Saved.');
      onClose();
    } catch {
      setBusy(false);
      setMsg("Couldn't save. Check your connection and tap Save again.");
    }
  };

  const indexed = rows.map((r, i) => [r, i] as const);
  const act = indexed.filter(([r]) => !r.a);
  const arc = indexed.filter(([r]) => r.a);
  return (
    <div className={u.stack} ref={box}>
      {act.map(([r, i], k) => (
        <div className={h.editRow} key={r.id || `new-${i}`}>
          <input
            className={u.input}
            type="text"
            maxLength={30}
            value={r.n}
            data-hed={i}
            aria-label="Habit name"
            onChange={(e) => rename(i, e.target.value)}
          />
          <button
            type="button"
            className={h.iconBtn}
            aria-label="Move up"
            disabled={k === 0}
            onClick={() => move(i, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className={h.iconBtn}
            aria-label="Move down"
            disabled={k === act.length - 1}
            onClick={() => move(i, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className={cx(u.btn, u.small)}
            aria-label="Hide habit"
            onClick={() => hide(i)}
          >
            Hide
          </button>
        </div>
      ))}
      <div className={u.actions}>
        <button
          type="button"
          className={u.btn}
          data-hadd="1"
          disabled={activeN >= MAX_ACTIVE}
          onClick={add}
        >
          + Add habit
        </button>
      </div>
      {arc.length > 0 && (
        <>
          <div className={u.caps} style={{ marginTop: 8 }}>
            Hidden (history kept)
          </div>
          {arc.map(([r, i]) => (
            <div className={h.editRow} key={r.id}>
              <input
                className={u.input}
                type="text"
                value={r.n}
                disabled
                aria-label="Hidden habit"
              />
              <button
                type="button"
                className={cx(u.btn, u.small)}
                disabled={activeN >= MAX_ACTIVE}
                aria-label="Restore habit"
                onClick={() => restore(i)}
              >
                Restore
              </button>
            </div>
          ))}
        </>
      )}
      <div className={cx(u.msg, u.warn)} role="status">
        {msg || (activeN >= MAX_ACTIVE ? 'Up to 8 habits.' : '')}
      </div>
      <div className={u.actions}>
        <button type="button" className={u.btn} data-hcancel="1" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={u.primary}
          data-hsave="1"
          disabled={busy}
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
    </div>
  );
}
