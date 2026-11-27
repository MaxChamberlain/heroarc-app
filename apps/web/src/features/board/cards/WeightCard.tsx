import { useEffect, useState } from 'react';
import { Card } from '../Card';
import { Bar } from '../charts';
import { useDashboard } from '../DashboardContext';
import { emptyDay, eventId, fmt, shift, signed } from '../lib';
import u from '../ui.module.css';
import c from './cards.module.css';

/** The day's weight, and its change vs the day before. */
export function useWeight() {
  const { data, sel } = useDashboard();
  const wt = data.days[sel]?.weight ?? null;
  const prev = data.days[shift(sel, -1)]?.weight ?? null;
  const vsPrev =
    wt == null
      ? 'no weigh-in yet'
      : prev == null
        ? 'first reading'
        : `${signed(Math.round((wt - prev) * 10) / 10)} lb vs yesterday`;
  return { wt, vsPrev };
}

/** Weight entry box (the card and the phone quick action). Saves for the selected day. */
export function WeightEntry({ onSaved }: { onSaved?: () => void }) {
  const { data, sel, patch, toast, api } = useDashboard();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const has = data.days[sel]?.weight != null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear the box when the day changes.
  useEffect(() => setValue(''), [sel]);

  const save = async () => {
    if (busy) return;
    const raw = value.replace(',', '.').trim();
    const w = Number.parseFloat(raw);
    if (!/^\d{2,3}(\.\d{1,2})?$/.test(raw) || !(w >= 70 && w <= 500)) {
      toast('Enter your weight in lb, like 188.2');
      return;
    }
    const r1 = Math.round(w * 10) / 10;
    const day = sel;
    setBusy(true);
    try {
      await api.legacy.weight({ id: eventId('w'), d: day, w: r1 });
      patch((s) => {
        s.days[day] = { ...(s.days[day] ?? emptyDay()), weight: r1 };
      });
      setValue('');
      const p = data.days[shift(day, -1)]?.weight;
      toast(
        `Saved ${r1.toFixed(1)} lb${p != null ? ` (${(r1 - p > 0 ? '+' : '') + (r1 - p).toFixed(1)} vs yesterday)` : ''}`,
      );
      onSaved?.();
    } catch {
      toast("Couldn't save that. Check your connection and tap Save again.");
    }
    setBusy(false);
  };

  return (
    <div className={u.inline}>
      <input
        className={u.input}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        maxLength={6}
        placeholder={has ? 'Change to (lb)' : 'Log weight (lb)'}
        aria-label="Weight in pounds"
        data-weight-input="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
        }}
      />
      <button
        type="button"
        className={u.primary}
        data-weight-save="1"
        disabled={busy}
        onClick={() => void save()}
      >
        {has ? 'Update' : 'Save'}
      </button>
    </div>
  );
}

/** Weight (with change vs yesterday and an entry box), steps and active calories. */
export function WeightCard() {
  const { data, sel } = useDashboard();
  const d = data.days[sel];
  const G = data.goals;
  const { wt, vsPrev } = useWeight();
  const st = d?.steps ?? 0;
  const ak = d?.activeKcal ?? 0;
  const sg = G.steps || 10000;
  const ag = G.activeKcal || 500;
  return (
    <Card title="Weight and activity">
      <div className={u.stack}>
        <div className={u.row} style={{ border: 0 }}>
          <b className={u.big}>{wt == null ? '—' : `${wt.toFixed(1)} lb`}</b>
          <span className={u.label}>{vsPrev}</span>
        </div>
        <WeightEntry />
        <hr className={u.sep} style={{ margin: '4px 0' }} />
        <div className={c.pair}>
          <div className={c.stat}>
            <span className={u.label}>Steps</span>
            <b className={u.value}>{d?.steps == null ? '—' : fmt(st)}</b>
            <Bar fraction={st / sg} color="var(--info)" />
            <small>
              {d?.steps == null ? 'no data' : `${Math.round((st / sg) * 100)}% of ${fmt(sg)}`}
            </small>
          </div>
          <div className={c.stat}>
            <span className={u.label}>Active kcal</span>
            <b className={u.value}>{d?.activeKcal == null ? '—' : fmt(ak)}</b>
            <Bar fraction={ak / ag} color="var(--info)" />
            <small>
              {d?.activeKcal == null ? 'no data' : `${Math.round((ak / ag) * 100)}% of ${fmt(ag)}`}
            </small>
          </div>
        </div>
      </div>
    </Card>
  );
}
