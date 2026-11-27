import type { TrainingSection } from '@heroarc/contracts';
import { useState } from 'react';
import { useDashboard } from '../DashboardContext';
import { cx, eventId } from '../lib';
import u from '../ui.module.css';
import t from './Training.module.css';

interface ExRow {
  n: string;
  sets: string;
  star: 0 | 1;
}
interface WorkoutRow {
  name: string;
  ex: ExRow[];
}

const blankWorkout = (): WorkoutRow => ({ name: '', ex: [{ n: '', sets: '', star: 0 }] });
const swap = <T,>(a: T[], i: number, d: number): T[] => {
  const j = i + d;
  if (j < 0 || j >= a.length) return a;
  const next = [...a];
  [next[i], next[j]] = [next[j] as T, next[i] as T];
  return next;
};

/** Name workouts, add exercises with sets × reps, star the lifts to track a max for. */
export function PlanEditor({
  training,
  onClose,
}: {
  training: TrainingSection | null;
  onClose: () => void;
}) {
  const { patch, toast, api } = useDashboard();
  const [rows, setRows] = useState<WorkoutRow[]>(() => {
    const W = training?.program.workouts ?? [];
    const r = W.map((w) => ({
      name: w.name,
      ex: w.exercises.map((x) => ({
        n: x.n,
        sets: x.sets || '',
        star: (w.keyLifts.some((k) => k.toLowerCase() === x.n.toLowerCase()) ? 1 : 0) as 0 | 1,
      })),
    }));
    return r.length ? r : [blankWorkout()];
  });
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [busy, setBusy] = useState(false);

  const setW = (wi: number, fn: (w: WorkoutRow) => WorkoutRow) =>
    setRows((rs) => rs.map((w, i) => (i === wi ? fn(w) : w)));
  const setX = (wi: number, xi: number, fn: (x: ExRow) => ExRow) =>
    setW(wi, (w) => ({ ...w, ex: w.ex.map((x, i) => (i === xi ? fn(x) : x)) }));

  const save = async () => {
    if (busy) return;
    const W = rows
      .map((w) => ({
        name: w.name.trim(),
        ex: w.ex
          .map((x) => ({ n: x.n.trim(), sets: (x.sets || '').trim(), star: x.star }))
          .filter((x) => x.n),
      }))
      .filter((w) => w.name || w.ex.length);
    let bad = '';
    if (!W.length) bad = 'Add at least one workout.';
    const names = new Set<string>();
    for (const w of W) {
      if (bad) break;
      if (!w.name) bad = 'Give every workout a name.';
      else if (/^[=+@]/.test(w.name)) bad = 'Names cannot start with = + or @.';
      else if (names.has(w.name.toLowerCase())) bad = 'Two workouts have the same name.';
      names.add(w.name.toLowerCase());
      if (!bad && !w.ex.length) bad = `"${w.name}" needs at least one exercise.`;
      const seen = new Set<string>();
      for (const x of w.ex) {
        if (bad) break;
        if (/^[=+@]/.test(x.n) || /^[=+@]/.test(x.sets))
          bad = 'Entries cannot start with = + or @.';
        else if (seen.has(x.n.toLowerCase())) bad = `"${x.n}" appears twice in ${w.name}.`;
        seen.add(x.n.toLowerCase());
      }
      if (!bad && w.ex.filter((x) => x.star).length > 8) bad = 'Star at most 8 lifts per workout.';
    }
    if (bad) {
      setMsg({ text: bad, ok: false });
      return;
    }
    setBusy(true);
    try {
      await api.legacy.plan({ id: eventId('p'), workouts: W });
      patch((s) => {
        const program = {
          workouts: W.map((w) => ({
            name: w.name,
            exercises: w.ex.map((x) => ({ n: x.n, sets: x.sets, type: '' })),
            keyLifts: w.ex.filter((x) => x.star).map((x) => x.n),
          })),
          keyLifts: [],
        };
        s.training = s.training ? { ...s.training, program } : { program, log: [], pending: [] };
      });
      toast('Plan saved.');
      onClose();
    } catch {
      setMsg({ text: "Couldn't save. Check your connection and try again.", ok: false });
    }
    setBusy(false);
  };

  return (
    <div className={u.stack}>
      <p className={u.note}>
        Name your workouts, add exercises with sets and reps (like 3 x 10), and tap the star on the
        lifts you want to track a max for. Your logged history is kept if you change the plan.
      </p>
      {rows.map((w, wi) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place by position.
        <div className={t.workout} key={wi}>
          <div className={t.wHead}>
            <input
              className={u.input}
              data-pw={wi}
              maxLength={30}
              placeholder="Workout name (e.g. Upper)"
              value={w.name}
              aria-label="Workout name"
              onChange={(e) => setW(wi, (x) => ({ ...x, name: e.target.value }))}
            />
            <button
              type="button"
              className={t.iconBtn}
              aria-label="Move workout up"
              onClick={() => setRows((rs) => swap(rs, wi, -1))}
            >
              ↑
            </button>
            <button
              type="button"
              className={t.iconBtn}
              aria-label="Move workout down"
              onClick={() => setRows((rs) => swap(rs, wi, 1))}
            >
              ↓
            </button>
            <button
              type="button"
              className={t.iconBtn}
              aria-label="Remove workout"
              onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, i) => i !== wi) : rs))}
            >
              ✕
            </button>
          </div>
          {w.ex.map((x, xi) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place by position.
            <div className={t.xRow} key={xi}>
              <input
                className={cx(u.input, t.xName)}
                maxLength={40}
                placeholder="Exercise"
                value={x.n}
                aria-label="Exercise name"
                onChange={(e) => setX(wi, xi, (r) => ({ ...r, n: e.target.value }))}
              />
              <input
                className={cx(u.input, t.xSets)}
                maxLength={20}
                placeholder="3 x 10"
                value={x.sets}
                aria-label="Sets and reps"
                onChange={(e) => setX(wi, xi, (r) => ({ ...r, sets: e.target.value }))}
              />
              <button
                type="button"
                className={cx(t.iconBtn, t.star)}
                aria-label="Track a max for this lift"
                aria-pressed={!!x.star}
                onClick={() => setX(wi, xi, (r) => ({ ...r, star: r.star ? 0 : 1 }))}
              >
                {x.star ? '★' : '☆'}
              </button>
              <button
                type="button"
                className={t.iconBtn}
                aria-label="Move up"
                onClick={() => setW(wi, (r) => ({ ...r, ex: swap(r.ex, xi, -1) }))}
              >
                ↑
              </button>
              <button
                type="button"
                className={t.iconBtn}
                aria-label="Remove exercise"
                onClick={() =>
                  setW(wi, (r) =>
                    r.ex.length > 1 ? { ...r, ex: r.ex.filter((_, i) => i !== xi) } : r,
                  )
                }
              >
                ✕
              </button>
            </div>
          ))}
          <div className={u.actions}>
            <button
              type="button"
              className={cx(u.btn, u.small)}
              onClick={() =>
                setW(wi, (r) =>
                  r.ex.length < 14 ? { ...r, ex: [...r.ex, { n: '', sets: '', star: 0 }] } : r,
                )
              }
            >
              + Exercise
            </button>
          </div>
        </div>
      ))}
      <div className={u.actions}>
        <button
          type="button"
          className={u.btn}
          onClick={() => setRows((rs) => (rs.length < 7 ? [...rs, blankWorkout()] : rs))}
        >
          + Workout
        </button>
      </div>
      <div className={cx(u.msg, msg.ok ? u.good : u.warn)} role="status">
        {msg.text}
      </div>
      <div className={u.actions}>
        <button type="button" className={u.btn} data-pe="cancel" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={u.primary}
          data-pe="save"
          disabled={busy}
          onClick={() => void save()}
        >
          Save plan
        </button>
      </div>
    </div>
  );
}
