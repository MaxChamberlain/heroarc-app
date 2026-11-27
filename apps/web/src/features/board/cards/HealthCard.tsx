import { Card } from '../Card';
import { Ring } from '../charts';
import { useDashboard } from '../DashboardContext';
import { clock } from '../lib';
import u from '../ui.module.css';
import c from './cards.module.css';

/** Readiness and sleep rings, bed/wake times, hours slept and HRV (from Oura). */
export function HealthCard() {
  const { data, sel, isToday } = useDashboard();
  const d = data.days[sel];
  const r = d?.readiness ?? null;
  const sl = d?.sleep ?? null;
  const rows: Array<[string, string]> = [
    ['Bedtime', clock(d?.bed)],
    ['Wake time', clock(d?.wake)],
    ['Slept', d?.sleepHours == null ? '—' : `${d.sleepHours.toFixed(1)} h`],
    ['HRV', d?.hrv == null ? '—' : `${Math.round(d.hrv)} ms`],
  ];
  return (
    <Card title="Health">
      <div className={c.rings}>
        <Ring pct={(r || 0) / 100} color="var(--acc)" value={r ?? '—'} label="Readiness" />
        <Ring pct={(sl || 0) / 100} color="var(--acc2)" value={sl ?? '—'} label="Sleep score" />
      </div>
      {rows.map(([label, value]) => (
        <div className={u.row} key={label}>
          <span className={u.label}>{label}</span>
          <b className={u.value}>{value}</b>
        </div>
      ))}
      {isToday && r == null && sl == null && (
        <p className={u.note}>Not synced yet. Open the Oura app to load last night.</p>
      )}
    </Card>
  );
}
