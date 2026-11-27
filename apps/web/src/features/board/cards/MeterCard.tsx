import { alchemistMeterSvg } from '../art';
import { Card } from '../Card';
import { useDashboard } from '../DashboardContext';
import { cx, fmt } from '../lib';
import s from './Meter.module.css';

/** Readiness, sleep, protein and steps for the day as four meters. */
export function MeterCard() {
  const { data, sel, theme } = useDashboard();
  const d = data.days[sel];
  const G = data.goals;
  const drawn = theme.variants.meter === 'hand-drawn';
  const channels: Array<[string, string, number | null | undefined, number]> = [
    ['Ready', 'Readiness', d?.readiness, 100],
    ['Sleep', 'Sleep score', d?.sleep, 100],
    ['Prot', 'Protein', d?.protein, G.protein || 110],
    ['Steps', 'Steps', d?.steps, G.steps || 10000],
  ];
  const frac = (v: number | null | undefined, max: number) =>
    v == null ? 0 : Math.max(0, Math.min(1, v / max));

  return (
    <Card title="Meters" compact>
      <div className={s.wrap}>
        <div className={s.meter}>
          {channels.map(([name, long, v, max], i) => {
            const on = Math.round(frac(v, max) * 16);
            return (
              // biome-ignore lint/a11y/useSemanticElements: LED segments can't be drawn with a native <meter>.
              <div
                className={s.ch}
                key={name}
                role="meter"
                aria-label={long}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={v ?? 0}
              >
                {drawn ? (
                  <div
                    className={s.drawn}
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: hand-drawn meter SVG built from numbers.
                    dangerouslySetInnerHTML={{ __html: alchemistMeterSvg(frac(v, max), i + 1) }}
                  />
                ) : (
                  <div className={s.seg} aria-hidden="true">
                    {Array.from({ length: 16 }, (_, k) => (
                      <b
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed 16-segment meter.
                        key={k}
                        className={k < on ? cx(s.on, k >= 14 ? s.pk : k >= 11 && s.hi) : undefined}
                      />
                    ))}
                  </div>
                )}
                <span className={s.label}>
                  {name}
                  <b>{v == null ? '—' : fmt(v)}</b>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
