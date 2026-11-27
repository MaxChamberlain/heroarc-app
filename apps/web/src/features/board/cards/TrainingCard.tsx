import type { TrainingLogEntry } from '@heroarc/contracts';
import { useEffect, useRef, useState } from 'react';
import { Card } from '../Card';
import { useDashboard } from '../DashboardContext';
import { cx, eventId, noon, shift } from '../lib';
import { useOpenCard } from '../openCard';
import { Sheet } from '../Sheet';
import u from '../ui.module.css';
import { PlanEditor } from './PlanEditor';
import t from './Training.module.css';

type Status = 'done' | 'partial' | 'rest';
type LiftResult = TrainingLogEntry['lifts'][string];
/** Raw input text for a key lift while a session is being filled in. */
type LiftDraft = { wt?: string; reps?: string };

/** An unfinished session survives the app being closed (kept on this device only). */
const DRAFT_KEY = 'heroarc_train_draft_v1';
const ARROW = { up: '▲', same: '=', down: '▼' } as const;
const STATUS_LABEL: Record<string, string> = {
  done: 'Completed',
  partial: 'Partial',
  rest: 'Rest day',
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const reps = (x: { reps?: number | null } | null | undefined) => (x?.reps ? ` × ${x.reps}` : '');

/** Change vs the last logged max: direction + label ("▲ +5 lb", "= same as last"). */
function delta(wt: string | number | null | undefined, last: { wt: number } | null) {
  if (wt == null || wt === '' || !last) return { d: null, t: '' } as const;
  const n = Number(wt);
  const df = Math.round((n - last.wt) * 10) / 10;
  const d = n > last.wt ? 'up' : n < last.wt ? 'down' : 'same';
  return {
    d,
    t: d === 'same' ? '= same as last' : `${d === 'up' ? '▲ +' : '▼ −'}${Math.abs(df)} lb`,
  } as const;
}

function lastLift(log: TrainingLogEntry[], name: string, before: string) {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (!e || e.d >= before) continue;
    const l = e.lifts?.[name];
    if (l && l.wt != null) return { wt: l.wt, dir: l.dir, reps: l.reps || null, d: e.d };
  }
  return null;
}

interface Draft {
  d: string;
  w: string;
  lifts: Record<string, { wt?: number | null; reps?: number | null }>;
  t: number;
}
const readDraft = (): Draft | null => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
};
const clearDraft = () => {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
};
const toNum = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v));

/**
 * Training: the week at a glance and the day's session. Pick a workout to open the session
 * (enter key-lift maxes, then Complete or Partial), or log a Rest day. Edit plan opens the
 * plan editor.
 */
export function TrainingCard() {
  const { data, sel, setSel, today, patch, api } = useDashboard();
  const T = data.training;
  const [w, setW] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [msg, setMsg] = useState('');
  const [lifts, setLifts] = useState<Record<string, LiftDraft>>({});
  const [need, setNeed] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const restored = useRef(false);
  useOpenCard('training', (v) => {
    if (v === 'plan') setPlanOpen(true);
  });

  const log = T?.log ?? [];
  const workouts = T?.program.workouts ?? [];
  const entryOn = (d: string) => log.find((x) => x.d === d);
  const e = entryOn(sel);

  // Restore an unfinished session from this device once, when the card first appears.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const d = readDraft();
    if (!d) return;
    if (
      !d.w ||
      !d.d ||
      Date.now() - d.t > 3 * 864e5 ||
      !workouts.some((x) => x.name === d.w) ||
      d.d > today
    ) {
      clearDraft();
      return;
    }
    const prev = entryOn(d.d);
    if (prev && prev.w === d.w && (prev.s === 'done' || prev.s === 'partial')) {
      clearDraft();
      return;
    }
    setSel(d.d);
    setW(d.w);
    setLifts(
      Object.fromEntries(
        Object.entries(d.lifts || {}).map(([k, v]) => [
          k,
          {
            wt: v.wt == null ? undefined : String(v.wt),
            reps: v.reps == null ? undefined : String(v.reps),
          },
        ]),
      ),
    );
  }, []);

  const saveDraft = (workout: string | null, l: Record<string, LiftDraft>) => {
    try {
      if (!workout) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      const numeric = Object.fromEntries(
        Object.entries(l).map(([k, v]) => [k, { wt: toNum(v.wt), reps: toNum(v.reps) }]),
      );
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ d: sel, w: workout, lifts: numeric, t: Date.now() }),
      );
    } catch {}
  };

  /** Save a session: show it at once, roll back if the API refuses. */
  const post = async (ev: {
    d: string;
    w: string | null;
    s: Status;
    lifts: Record<string, LiftResult>;
  }) => {
    const prev = entryOn(ev.d);
    const rec: TrainingLogEntry = { d: ev.d, w: ev.w, s: ev.s, lifts: ev.lifts, t: 'pending' };
    const put = (r: TrainingLogEntry | undefined) =>
      patch((s) => {
        if (!s.training) return;
        const L = s.training.log;
        const i = L.findIndex((x) => x.d === ev.d);
        if (r) {
          if (i >= 0) L[i] = r;
          else {
            L.push(r);
            L.sort((a, b) => (a.d < b.d ? -1 : 1));
          }
        } else if (i >= 0) L.splice(i, 1);
      });
    put(rec);
    setMsg('Saving…');
    try {
      await api.legacy.training({ id: eventId('e'), d: ev.d, w: ev.w, s: ev.s, lifts: ev.lifts });
      setMsg('Saved');
    } catch {
      put(prev);
      setMsg('Could not save — check your connection and tap again');
      if (ev.s !== 'rest' && ev.w) {
        const back = Object.fromEntries(
          Object.entries(ev.lifts).map(([k, v]) => [
            k,
            {
              wt: v.wt == null ? undefined : String(v.wt),
              reps: v.reps == null ? undefined : String(v.reps),
            },
          ]),
        );
        setW(ev.w);
        setLifts(back);
        saveDraft(ev.w, back);
      }
    }
  };

  const planSheet = (
    <Sheet open={planOpen} onClose={() => setPlanOpen(false)} title="Training plan" wide>
      <PlanEditor training={T} onClose={() => setPlanOpen(false)} />
    </Sheet>
  );

  if (!T || !workouts.length)
    return (
      <Card
        title="Training"
        footer={
          <button
            type="button"
            className={u.primary}
            data-pe="open"
            onClick={() => setPlanOpen(true)}
          >
            Set up plan
          </button>
        }
      >
        <p className={u.note}>
          No plan yet. Add your workouts and exercises and this card will track them.
        </p>
        {planSheet}
      </Card>
    );

  // Week strip (Mon–Sun around the selected day).
  const dow = (noon(sel).getDay() + 6) % 7;
  let weekCount = 0;
  const cells = Array.from({ length: 7 }, (_, i) => {
    const k = shift(sel, i - dow);
    const x = entryOn(k);
    let c: string | undefined;
    let label = '';
    if (x) {
      if (x.s === 'done') {
        c = t.done;
        weekCount++;
        label = '✓';
      } else if (x.s === 'partial') {
        c = t.partial;
        weekCount++;
        label = '½';
      } else {
        c = t.rest;
        label = 'R';
      }
    }
    return (
      <div key={k} className={cx(t.day, k === sel && t.sel, k > today && t.fut)}>
        <span>{'MTWTFSS'[i]}</span>
        <i className={c}>{label}</i>
      </div>
    );
  });

  const fut = sel > today;
  const view = fut ? 'future' : e && !changing ? 'summary' : 'chips';

  const nextUp = () => {
    const names = workouts.map((x) => x.name);
    const last = [...log]
      .reverse()
      .find((x) => x.w && names.includes(x.w) && (x.s === 'done' || x.s === 'partial'));
    return last?.w ? names[(names.indexOf(last.w) + 1) % names.length] : names[0];
  };

  const pick = (name: string) => {
    setW(name);
    setLifts({});
    setMsg('');
    setNeed(null);
    saveDraft(name, {});
  };
  const closeSession = () => {
    setW(null);
    setNeed(null);
    clearDraft();
  };

  const workout = w ? (workouts.find((x) => x.name === w) ?? workouts[0]) : undefined;
  const keyFor = (exercise: string) => workout?.keyLifts.find((k) => sameName(k, exercise));
  const existing = (k: string) => (e && e.w === workout?.name ? e.lifts?.[k] : undefined);
  const shown = (k: string, field: 'wt' | 'reps'): string => {
    const typed = lifts[k]?.[field];
    if (typed !== undefined) return typed;
    const v = existing(k)?.[field];
    return v == null ? '' : String(v);
  };
  const setLift = (k: string, field: 'wt' | 'reps', v: string) => {
    const next = { ...lifts, [k]: { ...lifts[k], [field]: v } };
    setLifts(next);
    saveDraft(w, next);
  };

  const finish = (status: 'done' | 'partial') => {
    if (!workout) return;
    const L: Record<string, LiftResult> = { ...(e && e.w === workout.name ? e.lifts : {}) };
    const keys = workout.exercises.map((x) => keyFor(x.n)).filter((k): k is string => !!k);
    // A key lift needs both weight and reps, or neither.
    for (const k of keys) {
      const wtRaw = shown(k, 'wt');
      const rpRaw = shown(k, 'reps');
      if (!wtRaw && !rpRaw) continue;
      const wv = Number(wtRaw);
      const rv = Math.round(Number(rpRaw));
      const wtOk = wtRaw !== '' && Number.isFinite(wv) && wv >= 0 && wv <= 1500;
      const rpOk = rpRaw !== '' && Number.isFinite(rv) && rv >= 1 && rv <= 200;
      if (!(wtOk && rpOk)) {
        setNeed(k);
        setMsg(`${wtOk ? 'Add reps' : 'Add weight'} for ${k}, or clear both to skip it`);
        document
          .querySelector<HTMLInputElement>(
            `[data-l="${CSS.escape(k)}"] [data-act=${wtOk ? 'rp' : 'wt'}]`,
          )
          ?.focus();
        return;
      }
    }
    setNeed(null);
    for (const k of keys) {
      const wtRaw = shown(k, 'wt');
      if (wtRaw === '') continue;
      const wv = Number(wtRaw);
      if (!Number.isFinite(wv) || wv < 0 || wv > 1500) continue;
      const rpRaw = shown(k, 'reps');
      const rv = rpRaw === '' ? null : Math.round(Number(rpRaw));
      L[k] = {
        dir: delta(wv, lastLift(log, k, sel)).d,
        wt: wv,
        reps: rv != null && Number.isFinite(rv) && rv >= 1 && rv <= 200 ? rv : null,
      };
    }
    setChanging(false);
    setLifts({});
    setW(null);
    clearDraft();
    void post({ d: sel, w: workout.name, s: status, lifts: L });
  };

  let body: React.ReactNode;
  if (view === 'future') body = <p className={u.note}>Nothing to log for a future day.</p>;
  else if (view === 'summary' && e) {
    const chips = Object.entries(e.lifts || {}).filter(([, v]) => v && (v.dir || v.wt != null));
    body = (
      <div className={u.stack}>
        <div className={cx(t.summary, e.s === 'partial' && t.summaryPartial)}>
          <b>{e.s === 'rest' ? 'Rest day' : e.w || 'Workout'}</b>
          <span className={t.status}>
            {e.s === 'rest'
              ? '✓ recovery logged'
              : `${e.s === 'done' ? '✓ ' : '½ '}${STATUS_LABEL[e.s ?? ''] ?? e.s}`}
          </span>
        </div>
        {chips.length > 0 && (
          <div className={t.lifts}>
            {chips.map(([k, v]) => (
              <span
                key={k}
                className={cx(t.lift, v.dir === 'up' && t.up, v.dir === 'down' && t.down)}
              >
                {`${k} ${v.dir ? ARROW[v.dir] : ''}${v.wt != null ? ` ${v.wt} lb${reps(v)}` : ''}`}
              </span>
            ))}
          </div>
        )}
        <div className={u.actions}>
          <button
            type="button"
            className={cx(u.btn, u.small)}
            data-act="edit"
            onClick={() => {
              setChanging(true);
              setMsg('');
            }}
          >
            Change
          </button>
        </div>
      </div>
    );
  } else {
    const nx = nextUp();
    body = (
      <div className={u.stack}>
        {e && <span className={u.label}>Change this day:</span>}
        <div className={u.chips}>
          {workouts.map((x) => (
            <button
              key={x.name}
              type="button"
              className={cx(u.chip, x.name === nx && u.chipNext)}
              data-act="pick"
              data-v={x.name}
              onClick={() => pick(x.name)}
            >
              {x.name}
              {x.name === nx && <em>next up</em>}
            </button>
          ))}
          <button
            type="button"
            className={u.chip}
            data-act="rest"
            onClick={() => {
              setChanging(false);
              clearDraft();
              void post({ d: sel, w: null, s: 'rest', lifts: {} });
            }}
          >
            Rest
          </button>
        </div>
        {e && (
          <div className={u.actions}>
            <button
              type="button"
              className={u.link}
              data-act="back"
              onClick={() => setChanging(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card
      title="Training"
      footer={
        <button
          type="button"
          className={cx(u.btn, u.small)}
          data-pe="open"
          onClick={() => setPlanOpen(true)}
        >
          Edit plan
        </button>
      }
    >
      <div className={t.week}>{cells}</div>
      <p className={u.note} style={{ margin: '6px 0 12px' }}>
        {`${weekCount} workout${weekCount === 1 ? '' : 's'} this week · goal 3`}
      </p>
      {body}
      {msg && !w && (
        <p className={u.note} role="status" style={{ marginTop: 8 }}>
          {msg}
        </p>
      )}
      <Sheet
        open={!!workout}
        onClose={closeSession}
        title={workout ? `${workout.name} session` : 'Session'}
        footer={
          <>
            <button
              type="button"
              className={u.btn}
              data-act="status"
              data-v="partial"
              onClick={() => finish('partial')}
            >
              Partial
            </button>
            <button
              type="button"
              className={u.primary}
              data-act="status"
              data-v="done"
              onClick={() => finish('done')}
            >
              Complete
            </button>
          </>
        }
      >
        {workout && (
          <div className={u.stack}>
            <p className={u.note}>
              Starred lifts: enter your max (weight and reps, e.g. 150 lb × 10), then tap Complete.
              Leave both blank to skip a lift. The draft is kept on this device until you finish.
            </p>
            {workout.exercises.map((x) => {
              const sub = `${x.sets}${x.type ? ` · ${x.type}` : ''}`;
              const kl = keyFor(x.n);
              if (!kl)
                return (
                  <div className={t.ex} key={x.n}>
                    <b>{x.n}</b>
                    <small>{sub}</small>
                  </div>
                );
              const ll = lastLift(log, kl, sel);
              const wv = shown(kl, 'wt');
              const dx = delta(wv, ll);
              return (
                <div className={cx(t.ex, t.key, need === kl && t.need)} data-l={kl} key={x.n}>
                  <div>
                    <b>{`★ ${x.n}`}</b>
                    <small>{sub}</small>
                    <small>{ll ? `last max ${ll.wt} lb${reps(ll)}` : 'no max logged yet'}</small>
                  </div>
                  <div className={t.max}>
                    <label className={u.field}>
                      <span className={u.fieldLabel}>Max (lb)</span>
                      <input
                        className={u.input}
                        type="number"
                        inputMode="decimal"
                        step="2.5"
                        min="0"
                        max="1500"
                        placeholder={ll ? String(ll.wt) : 'lb'}
                        value={wv}
                        data-act="wt"
                        aria-label={`Max weight for ${x.n}`}
                        aria-invalid={need === kl && !wv ? true : undefined}
                        onChange={(ev) => setLift(kl, 'wt', ev.target.value)}
                      />
                    </label>
                    <label className={u.field}>
                      <span className={u.fieldLabel}>Reps</span>
                      <input
                        className={u.input}
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min="1"
                        max="200"
                        placeholder="reps"
                        value={shown(kl, 'reps')}
                        data-act="rp"
                        aria-label={`Reps at max for ${x.n}`}
                        aria-invalid={need === kl && !shown(kl, 'reps') ? true : undefined}
                        onChange={(ev) => setLift(kl, 'reps', ev.target.value)}
                      />
                    </label>
                  </div>
                  {dx.t && (
                    <div className={cx(t.delta, dx.d === 'up' && t.up, dx.d === 'down' && t.down)}>
                      {dx.t}
                    </div>
                  )}
                </div>
              );
            })}
            {msg && (
              <p className={cx(u.msg, u.warn)} role="status">
                {msg}
              </p>
            )}
          </div>
        )}
      </Sheet>
      {planSheet}
    </Card>
  );
}
