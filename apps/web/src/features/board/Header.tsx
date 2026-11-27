import { heroProgress } from '@heroarc/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { orpc } from '../../lib/orpc';
import { SLOT_PILLAR } from '../../themes/types';
import { usePendingActivity } from '../account/Connections';
import { useOuraStatus } from '../account/Oura';
import { type HeroFill, heroSvg } from './art';
import { useDashboard } from './DashboardContext';
import s from './Header.module.css';
import h from './Hero.module.css';
import {
  ChevronLeft,
  ChevronRight,
  CustomizeIcon,
  GearIcon,
  RefreshIcon,
  SparkIcon,
} from './icons';
import { cx, dayLabel, shift } from './lib';

const SLOTS = ['helm', 'armor', 'legs', 'blade', 'aura'] as const;

/** `?force=1,0.5,0,1,0.2` overrides the hero fill (for previewing figure states). */
export function forcedFill(fill: HeroFill): HeroFill {
  if (typeof window === 'undefined') return fill;
  const q = new URLSearchParams(window.location.search).get('force');
  if (!q) return fill;
  const a = q.split(',').map(Number);
  const out = { ...fill };
  SLOTS.forEach((k, i) => {
    const v = a[i];
    if (v != null && Number.isFinite(v)) out[k] = v;
  });
  return out;
}

export function Header({
  editing,
  onCustomize,
  onSettings,
  onCoach,
}: {
  editing: boolean;
  onCustomize: () => void;
  onSettings: () => void;
  /** Tablets: Coach opens from here (desktop has its column, phones the dock). */
  onCoach?: () => void;
}) {
  const { data, sel, setSel, today, isToday, minDay, reload, toast, api } = useDashboard();
  const [spinning, setSpinning] = useState(false);
  const waiting = usePendingActivity();
  const oura = useOuraStatus();
  const qc = useQueryClient();

  /** Refresh: ask for a wearable sync, then reload the snapshot. */
  const refresh = async () => {
    if (spinning) return;
    setSpinning(true);
    const t0 = Date.now();
    const prev = data.updated;
    const done = (msg: string) => {
      toast(msg);
      setTimeout(() => setSpinning(false), Math.max(0, 600 - (Date.now() - t0)));
    };
    // With Oura connected, sync it first; otherwise just reload.
    let ouraMsg = '';
    if (oura.data?.connected) {
      try {
        const r = await api.oura.sync();
        qc.setQueryData(orpc.oura.status.queryKey(), r);
        if (r.status === 'reconnect') ouraMsg = 'Oura needs connecting again (Settings → Oura).';
        else if (r.status === 'error') ouraMsg = "Couldn't reach Oura; HeroArc will retry shortly.";
      } catch {
        ouraMsg = "Couldn't reach Oura; HeroArc will retry shortly.";
      }
    }
    try {
      const next = await reload();
      done(
        ouraMsg ||
          (!oura.data?.connected
            ? 'Reloaded.'
            : next?.updated && next.updated !== prev
              ? `Synced. Updated ${next.updated}`
              : 'Synced. Already up to date'),
      );
    } catch {
      done('Could not refresh. Close and reopen the app.');
    }
  };

  const title = isToday ? 'Today' : dayLabel(sel, { weekday: 'long' });

  return (
    <header className={s.header}>
      <div className={s.inner}>
        <HeroButton />
        <div className={s.titles}>
          <span className={s.tagline} aria-hidden="true" />
          <h1 className={s.title}>{title}</h1>
          <p className={s.sub}>
            <span>
              <span className={s.badge} aria-hidden="true" />
              {dayLabel(sel, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className={s.updated}>{`Updated ${data.updated}`}</span>
          </p>
        </div>
        <div className={s.tools}>
          {onCoach && (
            <button type="button" className={s.coach} onClick={onCoach} data-coach-open="1">
              <SparkIcon size={18} />
              Coach
            </button>
          )}
          <div className={s.nav}>
            <button
              type="button"
              className={s.iconBtn}
              aria-label="Previous day"
              disabled={sel <= minDay}
              onClick={() => setSel(shift(sel, -1))}
            >
              <ChevronLeft />
            </button>
            <input
              type="date"
              className={s.pick}
              aria-label="Day"
              min={minDay}
              max={today}
              value={sel}
              onChange={(e) => {
                if (e.target.value) setSel(e.target.value);
              }}
            />
            <button
              type="button"
              className={s.iconBtn}
              aria-label="Next day"
              disabled={sel >= today}
              onClick={() => setSel(shift(sel, 1))}
            >
              <ChevronRight />
            </button>
            {!isToday && (
              <button type="button" className={s.today} onClick={() => setSel(today)}>
                Today
              </button>
            )}
          </div>
          <div className={s.actions}>
            <button
              type="button"
              className={cx(s.iconBtn, spinning && s.spin)}
              aria-label="Refresh data"
              aria-busy={spinning || undefined}
              onClick={() => void refresh()}
            >
              <RefreshIcon />
            </button>
            <button
              type="button"
              className={s.iconBtn}
              aria-label="Customize board"
              aria-pressed={editing}
              data-customize="1"
              onClick={onCustomize}
            >
              <CustomizeIcon />
            </button>
            <span className={s.badgeWrap}>
              <button
                type="button"
                className={s.iconBtn}
                aria-label={waiting ? `Settings (${waiting} waiting for you)` : 'Settings'}
                onClick={onSettings}
              >
                <GearIcon />
              </button>
              {waiting > 0 && (
                <span className={s.badge} aria-hidden="true" data-waiting={waiting}>
                  {waiting}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

/** The hero figure with its five progress pips; tapping it opens "Your character". */
function HeroButton() {
  const { data, sel, theme } = useDashboard();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const progress = useMemo(
    () =>
      heroProgress({
        day: sel,
        days: data.days,
        goals: data.goals,
        sessions: (data.training?.log ?? []).map((e) => ({ d: e.d, s: e.s })),
      }),
    [sel, data.days, data.goals, data.training],
  );
  const fill = forcedFill(progress.fill);
  const forged = SLOTS.filter((k) => fill[k] >= 1).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const { counts, thresholds } = progress;
  const rows = [
    { slot: 'helm', need: 'nights scoring 75+', got: counts.helm, of: 4 },
    { slot: 'armor', need: `days protein ${thresholds.protein} g+`, got: counts.armor, of: 4 },
    {
      slot: 'legs',
      need: `days ${thresholds.steps.toLocaleString()}+ steps`,
      got: counts.legs,
      of: 4,
    },
    { slot: 'blade', need: 'workouts', got: counts.blade, of: 3 },
  ] as const;

  return (
    <div className={s.heroWrap} ref={wrap}>
      <button
        type="button"
        className={cx(h.hero, h.figure, s.hero)}
        aria-label={`Your character: ${forged} of 5 forged`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-hero="1"
      >
        <span
          // biome-ignore lint/security/noDangerouslySetInnerHtml: hero SVG built from theme constants and numbers (no user text).
          dangerouslySetInnerHTML={{ __html: heroSvg(fill, theme.hero, 'hb') }}
        />
        <span className={h.pips} aria-hidden="true">
          {SLOTS.map((k) => (
            <i key={k} className={fill[k] >= 1 ? h.on : fill[k] > 0 ? h.half : undefined} />
          ))}
        </span>
      </button>
      {open && (
        <div className={h.popover} role="dialog" aria-label="Your character">
          <div className={h.popHead}>
            <span
              className={h.figure}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: hero SVG built from theme constants and numbers (no user text).
              dangerouslySetInnerHTML={{ __html: heroSvg(fill, theme.hero, 'hp') }}
            />
            <div>
              <b>{theme.hero.name}</b>
              <small>{`${forged} of 5 forged · last 7 days`}</small>
            </div>
          </div>
          {rows.map((r) => (
            <div className={h.slot} key={r.slot}>
              <span>
                <b>{theme.hero.slotNames[r.slot]}</b>
                <span className={h.pillar}>{SLOT_PILLAR[r.slot]}</span>
              </span>
              <span className={h.slotBar}>
                <i
                  style={{
                    width: `${Math.round(fill[r.slot] * 100)}%`,
                    background: theme.hero.pieces[r.slot].color,
                  }}
                />
              </span>
              <span className={h.slotValue}>{`${Math.min(r.got, r.of)} / ${r.of}`}</span>
              <small>{r.need}</small>
            </div>
          ))}
          <div className={h.slot}>
            <span>
              <b>Aura</b>
              <span className={h.pillar}>Balance</span>
            </span>
            <span className={h.slotBar}>
              <i
                style={{ width: `${Math.round(fill.aura * 100)}%`, background: 'var(--hero-aura)' }}
              />
            </span>
            <span className={h.slotValue}>
              {fill.aura >= 1 ? 'awake' : `${Math.round(fill.aura * 100)}%`}
            </span>
            <small>lights fully when all four are forged</small>
          </div>
          <p className={h.popNote}>
            Pieces dim again as days age out of the 7-day window. Rest days and unlogged days never
            count against you.
          </p>
        </div>
      )}
    </div>
  );
}
