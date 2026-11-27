import { KCAL_PER_LB, slopePerDay } from '@heroarc/domain';
import { useState } from 'react';
import { Card } from '../Card';
import { useDashboard } from '../DashboardContext';
import { cx, dayLabel, fmt, shift } from '../lib';
import u from '../ui.module.css';
import c from './cards.module.css';

const sign = (v: number) => (v <= 0 ? '−' : '+');

/** Energy balance (the selected day) or Weekly balance (the 7 days before it). */
export function EnergyCard() {
  const [view, setView] = useState<'day' | 'week'>('day');
  return (
    <Card
      title={view === 'day' ? 'Energy balance' : 'Weekly balance'}
      actions={
        <fieldset className={u.seg} aria-label="Balance view">
          <button
            type="button"
            aria-pressed={view === 'day'}
            data-view="day"
            onClick={() => setView('day')}
          >
            Day
          </button>
          <button
            type="button"
            aria-pressed={view === 'week'}
            data-view="week"
            onClick={() => setView('week')}
          >
            Week
          </button>
        </fieldset>
      }
    >
      {view === 'day' ? <DayBalance /> : <WeekBalance />}
    </Card>
  );
}

function Big({ value }: { value: number | null }) {
  if (value == null) return <b className={cx(u.huge, u.dim)}>—</b>;
  return (
    <b
      className={cx(u.huge, value <= 0 ? c.deficit : c.surplus)}
    >{`${sign(value)}${fmt(Math.abs(value))}`}</b>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={u.row}>
      <span className={u.label}>{label}</span>
      <b className={u.value}>{value}</b>
    </div>
  );
}

function DayBalance() {
  const { data, sel, isToday } = useDashboard();
  const days = data.days;
  const d = days[sel];
  const out = d?.totalKcal;
  const inn = d?.kcalIn;
  const act = d?.activeKcal;
  if (out == null) return <p className={u.note}>No calorie-burn data for this day.</p>;
  const rest = act == null ? null : out - act;
  const bal = inn != null && inn > 0 ? inn - out : null;

  // Rolling 7-day average over finished days that have both numbers.
  let n7 = 0;
  let sum = 0;
  for (let i = 1; i <= 7; i++) {
    const x = days[shift(sel, -i)];
    if (x && (x.kcalIn ?? 0) > 0 && x.totalKcal != null) {
      n7++;
      sum += (x.kcalIn ?? 0) - x.totalKcal;
    }
  }
  return (
    <>
      <div className={c.balance}>
        <Big value={bal} />
        <span>
          {bal == null ? 'log food to see balance' : `kcal ${bal <= 0 ? 'deficit' : 'surplus'}`}
        </span>
      </div>
      <div className={c.eq}>{`${bal == null ? '—' : fmt(inn)} in − ${fmt(out)} out`}</div>
      <Row label="Resting burn" value={rest == null ? '—' : fmt(rest)} />
      <Row label="Active burn" value={act == null ? '—' : fmt(act)} />
      <Row label="Total out" value={fmt(out)} />
      {n7 > 0 && (
        <>
          <Row
            label="7-day average"
            value={`${sign(sum / n7)}${fmt(Math.abs(sum / n7))} kcal/day`}
          />
          <p className={u.note}>{`${n7} of 7 prior days with food logged`}</p>
        </>
      )}
      {isToday && (
        <p className={u.note} style={{ marginTop: 8 }}>
          Day in progress: resting burn is Oura's full-day estimate and active burn is still
          growing. Food is only what you've logged so far, so the deficit shrinks as you eat.
        </p>
      )}
    </>
  );
}

function WeekBalance() {
  const { data, sel, isToday, today } = useDashboard();
  const days = data.days;
  const endD = isToday ? shift(sel, -1) : sel;
  const L: string[] = [];
  for (let i = 6; i >= 0; i--) L.push(shift(endD, -i));
  const logged = L.map((k) => days[k]).filter(
    (x) => x && (x.kcalIn ?? 0) > 0 && x.totalKcal != null,
  );
  const n = logged.length;
  const sum = logged.reduce((a, x) => a + ((x?.kcalIn ?? 0) - (x?.totalKcal ?? 0)), 0);

  // Actual change: a trend line through the week's weigh-ins (incl. this morning's), scaled to the span.
  const wk = isToday ? [...L, today] : L;
  const pts = wk
    .map((k, i) => ({ day: i, value: days[k]?.weight ?? null }))
    .filter((p): p is { day: number; value: number } => p.value != null);
  const slope = slopePerDay(pts);
  const wchg =
    pts.length >= 3 ? (slope ?? 0) * ((pts.at(-1)?.day ?? 0) - (pts[0]?.day ?? 0)) : null;

  const md = { month: 'short', day: 'numeric' } as const;
  const range = `${dayLabel(L[0] ?? endD, md)} – ${dayLabel(endD, md)}`;
  if (!n)
    return (
      <>
        <p className={u.note}>{range}</p>
        <div className={c.balance}>
          <Big value={null} />
          <span>no days with food logged yet</span>
        </div>
        <p className={u.note}>
          Log meals and this fills in: net deficit or surplus for the week, the weight change it
          predicts, and the weight change you actually saw.
        </p>
      </>
    );
  const exp = sum / KCAL_PER_LB;
  return (
    <>
      <p className={u.note}>{`${range}${isToday ? ' (completed days)' : ''}`}</p>
      <div className={c.balance}>
        <Big value={sum} />
        <span>{`kcal ${sum <= 0 ? 'deficit' : 'surplus'}, ${n} of 7 days logged`}</span>
      </div>
      <Row label="Average per logged day" value={`${sign(sum / n)}${fmt(Math.abs(sum / n))}`} />
      <Row label="Predicted weight change" value={`${sign(exp)}${Math.abs(exp).toFixed(1)} lb`} />
      <Row
        label="Actual weight trend"
        value={
          wchg == null
            ? '—'
            : `${wchg > 0 ? '+' : wchg < 0 ? '−' : ''}${Math.abs(wchg).toFixed(1)} lb`
        }
      />
      <p className={u.note} style={{ marginTop: 6 }}>
        {`${n < 4 ? 'Fewer than 4 logged days, so treat this as rough. ' : ''}Predicted = net kcal ÷ 3,500. Actual = a trend line through every weigh-in that week (needs 3 or more), including this morning’s, so one odd day doesn’t swing it. Daily weight swings of 1–3 lb are normal water changes, so judge by trend over a few weeks.`}
      </p>
    </>
  );
}
