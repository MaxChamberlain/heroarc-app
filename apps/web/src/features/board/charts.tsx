import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import s from './charts.module.css';
import { cx, dayLabel } from './lib';

/** Progress ring (Readiness / Sleep score). `color` is a token, e.g. 'var(--acc)'. */
export function Ring({
  pct,
  color,
  value,
  label,
}: {
  pct: number;
  color: string;
  value: string | number;
  label: string;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div className={s.ring}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className={s.ringTrack} cx="60" cy="60" r={r} fill="none" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className={s.ringValue}>
        <b>{value}</b>
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Thin progress bar; `big` for the nutrition bars. `color` is a token. */
export function Bar({ fraction, color, big }: { fraction: number; color: string; big?: boolean }) {
  return (
    <div className={cx(s.bar, big && s.barBig)}>
      <i style={{ width: `${Math.max(0, Math.min(100, fraction * 100))}%`, background: color }} />
    </div>
  );
}

export interface ChartPoint {
  d: string;
  sleep: number | null;
  readiness: number | null;
  weight: number | null;
}
export type SeriesKey = 'weight' | 'sleep' | 'readiness';

export const SERIES: Record<SeriesKey, { lab: string; unit: string; dec: number; col: string }> = {
  weight: { lab: 'Weight', unit: ' lb', dec: 1, col: 'var(--acc)' },
  sleep: { lab: 'Sleep', unit: '', dec: 0, col: 'var(--acc2)' },
  readiness: { lab: 'Readiness', unit: '', dec: 0, col: 'var(--acc)' },
};

/** Chart box in SVG units; values sit between PAD and H − PAD. */
const W = 300;
const H = 90;
const PAD = 6;

function range(win: ChartPoint[], k: SeriesKey): { mn: number; mx: number } {
  if (k !== 'weight') return { mn: 50, mx: 100 };
  const v = win.map((x) => x.weight).filter((x): x is number => x != null);
  return { mn: (v.length ? Math.min(...v) : 0) - 0.5, mx: (v.length ? Math.max(...v) : 1) + 0.5 };
}
const yOf = (v: number, mn: number, mx: number) => H - PAD - ((v - mn) / (mx - mn)) * (H - 2 * PAD);

/** Polyline segments (gaps where a day has no value); single points become dots. */
function Line({ win, k, min, max }: { win: ChartPoint[]; k: SeriesKey; min: number; max: number }) {
  const n = win.length;
  const segs: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  win.forEach((x, i) => {
    const v = x[k];
    if (v == null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push([i * (W / (n - 1)), yOf(v, min, max)]);
  });
  if (cur.length) segs.push(cur);
  const color = SERIES[k].col;
  return (
    <>
      {segs.map((sg) =>
        sg.length > 1 ? (
          <polyline
            key={`${k}-${sg[0]?.[0]}`}
            fill="none"
            stroke={color}
            strokeWidth="2.6"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={sg.map((p) => p.join(',')).join(' ')}
          />
        ) : null,
      )}
    </>
  );
}

/**
 * 14-day line chart with a readout: dots on every real point; hover (mouse) or
 * touch-and-drag (phone) shows the exact values for a day. `fill` stretches it to the tile.
 */
export function LineChart({
  win,
  keys,
  fill,
}: {
  win: ChartPoint[];
  keys: SeriesKey[];
  fill?: boolean;
}) {
  const n = win.length;
  const rng = Object.fromEntries(keys.map((k) => [k, range(win, k)])) as Record<
    SeriesKey,
    { mn: number; mx: number }
  >;
  const wrap = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const [tipLeft, setTipLeft] = useState(0);

  // Any tap outside this chart hides its readout.
  useEffect(() => {
    const onDown = (e: globalThis.PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setIdx(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const show = (e: PointerEvent<HTMLDivElement>) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r || n < 2) return;
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    let best = -1;
    let bd = 9;
    win.forEach((p, i) => {
      if (!keys.some((k) => p[k] != null)) return;
      const dd = Math.abs(i / (n - 1) - f);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    if (best >= 0) setIdx(best);
  };

  useLayoutEffect(() => {
    if (idx == null || !wrap.current || !tipRef.current) return;
    const Wpx = wrap.current.getBoundingClientRect().width;
    const tw = tipRef.current.offsetWidth;
    const x = (idx / (n - 1)) * Wpx;
    setTipLeft(Math.max(0, Math.min(Wpx - tw, x - tw / 2)));
  }, [idx, n]);

  const p = idx != null ? win[idx] : undefined;
  const xPct = (i: number) => `${(i / (n - 1)) * 100}%`;
  const yPct = (k: SeriesKey, v: number) => `${(yOf(v, rng[k].mn, rng[k].mx) / H) * 100}%`;

  return (
    <div
      className={cx(s.chart, fill && s.fill)}
      ref={wrap}
      onPointerDown={show}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse' || e.buttons) show(e);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setIdx(null);
      }}
      data-chart={keys.join(',')}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <line
          className={s.grid}
          x1="0"
          x2={W}
          y1={H - 0.5}
          y2={H - 0.5}
          vectorEffect="non-scaling-stroke"
        />
        {keys.map((k) => (
          <Line key={k} win={win} k={k} min={rng[k].mn} max={rng[k].mx} />
        ))}
      </svg>
      {n >= 2 && (
        <div className={s.layer}>
          {keys.flatMap((k) =>
            win.map((pt, i) => {
              const v = pt[k];
              if (v == null) return null;
              return (
                <i
                  key={`${k}-${pt.d}`}
                  className={s.pt}
                  style={{ left: xPct(i), top: yPct(k, v), background: SERIES[k].col }}
                />
              );
            }),
          )}
          {p && idx != null && (
            <>
              <i className={s.guide} style={{ left: xPct(idx) }} />
              {keys.map((k) => {
                const v = p[k];
                return v == null ? null : (
                  <i
                    key={k}
                    className={s.hit}
                    style={{ left: xPct(idx), top: yPct(k, v), color: SERIES[k].col }}
                  />
                );
              })}
            </>
          )}
          <div className={s.tip} ref={tipRef} style={p ? { left: tipLeft } : { display: 'none' }}>
            {p && (
              <>
                <b>{dayLabel(p.d, { weekday: 'short', month: 'short', day: 'numeric' })}</b>
                {keys.map((k) => {
                  const v = p[k];
                  if (v == null) return null;
                  const sr = SERIES[k];
                  return (
                    <span key={k}>
                      <i style={{ background: sr.col }} />
                      {sr.lab} <em>{`${Number(v).toFixed(sr.dec)}${sr.unit}`}</em>
                    </span>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Colour key under a chart. */
export function ChartKey({ keys }: { keys: SeriesKey[] }) {
  return (
    <div className={s.key}>
      {keys.map((k) => (
        <span key={k}>
          <i style={{ background: SERIES[k].col }} />
          {SERIES[k].lab}
        </span>
      ))}
    </div>
  );
}
