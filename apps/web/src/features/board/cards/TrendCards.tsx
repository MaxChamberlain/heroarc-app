import { trendPerWeek } from '@heroarc/domain';
import { useContext, useMemo } from 'react';
import { AutoHeightContext, Card } from '../Card';
import { ChartKey, type ChartPoint, LineChart } from '../charts';
import { useDashboard } from '../DashboardContext';
import { cx, dayLabel, shift, signed } from '../lib';
import u from '../ui.module.css';
import c from './cards.module.css';

/** The 14 days ending on the selected day. */
function useWindow(): ChartPoint[] {
  const { data, sel } = useDashboard();
  return useMemo(() => {
    const out: ChartPoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = shift(sel, -i);
      const x = data.days[d];
      out.push({
        d,
        sleep: x?.sleep ?? null,
        readiness: x?.readiness ?? null,
        weight: x?.weight ?? null,
      });
    }
    return out;
  }, [data.days, sel]);
}

const to = (sel: string) => dayLabel(sel, { month: 'short', day: 'numeric' });

export function WeightTrendCard() {
  const { data, sel } = useDashboard();
  const auto = useContext(AutoHeightContext);
  const win = useWindow();
  const wt = data.days[sel]?.weight ?? null;
  const pts = win
    .map((x, i) => ({ day: i, value: x.weight }))
    .filter((p): p is { day: number; value: number } => p.value != null);
  const perWeek = trendPerWeek(pts);
  return (
    <Card title={`Weight, 14 days to ${to(sel)}`}>
      <div className={c.fill}>
        <div className={u.row} style={{ border: 0 }}>
          <b className={u.value}>{wt == null ? '—' : `${wt.toFixed(1)} lb`}</b>
          <span className={u.label}>
            {perWeek == null
              ? 'needs 3 weigh-ins for a trend'
              : `trend ${signed(Math.round(perWeek * 10) / 10)} lb / week`}
          </span>
        </div>
        <LineChart win={win} keys={['weight']} fill={!auto} />
        <p className={u.note}>
          Trend = a straight line through every weigh-in in these 14 days (needs 3 or more). Daily
          swings of 1–3 lb are normal water changes.
        </p>
      </div>
    </Card>
  );
}

export function SleepTrendCard() {
  const { sel } = useDashboard();
  const auto = useContext(AutoHeightContext);
  const win = useWindow();
  return (
    <Card title={`Sleep and readiness, 14 days to ${to(sel)}`}>
      <div className={c.fill}>
        <LineChart win={win} keys={['sleep', 'readiness']} fill={!auto} />
        <ChartKey keys={['sleep', 'readiness']} />
      </div>
    </Card>
  );
}

/** Mood, 14 days: daily average mood as bars, ending on the selected day. */
export function MoodTrendCard() {
  const { data, sel } = useDashboard();
  const log = data.mood?.log ?? {};
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(shift(sel, -i));
  const avgs = days.map((d) => {
    const a = log[d];
    return a?.length ? a.reduce((s, e) => s + e.m, 0) / a.length : null;
  });
  const title = `Mood, 14 days to ${to(sel)}`;
  if (!avgs.some((a) => a != null))
    return (
      <Card title={title}>
        <p className={u.note}>
          Nothing logged in these 14 days. A day without a log is just a day off, not a bad day.
        </p>
      </Card>
    );
  const spoken = days
    .map((d, i) => {
      const a = avgs[i];
      return a == null ? '' : `${to(d)} ${a.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(', ');
  return (
    <Card title={title}>
      <div
        className={c.moodBars}
        role="img"
        aria-label={`Daily average mood, last 14 days: ${spoken}`}
      >
        {days.map((d, i) => {
          const a = avgs[i];
          return (
            <div key={d} title={d}>
              {a == null ? (
                <i className={c.na} />
              ) : (
                <i
                  className={cx(d === sel && c.cur)}
                  style={{ height: `${Math.max(8, Math.round((a / 5) * 100))}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className={c.moodKey}>
        <span>Daily average</span>
        <span>5 = great</span>
      </div>
    </Card>
  );
}
