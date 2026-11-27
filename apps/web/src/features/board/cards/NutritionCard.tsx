import { Card } from '../Card';
import { Bar } from '../charts';
import { useDashboard } from '../DashboardContext';
import { cx, fmt } from '../lib';
import u from '../ui.module.css';
import c from './cards.module.css';

interface Macro {
  key: string;
  label: string;
  eaten: number | null | undefined;
  goal: number;
  unit: string;
  /** Over the goal is bad (calories), or reaching it is the point (protein). */
  kind: 'limit' | 'target';
  color: string;
}

/** Calories and protein (plus carbs and fat when tracked) eaten vs the goals. */
export function NutritionCard() {
  const { data, sel } = useDashboard();
  const d = data.days[sel];
  const G = data.goals;
  const macros: Macro[] = [
    {
      key: 'kcal',
      label: 'Calories',
      eaten: d?.kcalIn,
      goal: G.kcal || 2000,
      unit: 'kcal',
      kind: 'limit',
      color: 'var(--good)',
    },
    {
      key: 'protein',
      label: 'Protein',
      eaten: d?.protein,
      goal: G.protein || 110,
      unit: 'g',
      kind: 'target',
      color: 'var(--acc)',
    },
    ...(G.trackMacros
      ? ([
          {
            key: 'carbs',
            label: 'Carbs',
            eaten: d?.carbs,
            goal: G.carbs,
            unit: 'g',
            kind: 'limit',
            color: 'var(--info)',
          },
          {
            key: 'fat',
            label: 'Fat',
            eaten: d?.fat,
            goal: G.fat,
            unit: 'g',
            kind: 'limit',
            color: 'var(--acc2)',
          },
        ] as const)
      : []),
  ];
  return (
    <Card title="Nutrition">
      {macros.map((m) => {
        const v = m.eaten ?? 0;
        const over = v > m.goal;
        const unit = m.unit === 'g' ? ' g' : ` ${m.unit}`;
        const status =
          m.eaten == null
            ? 'nothing logged'
            : m.kind === 'target'
              ? `${v >= m.goal ? 'Goal reached ✓' : `${fmt(m.goal - v)}${unit} to go`} · ${Math.round((v / m.goal) * 100)}%`
              : `${over ? `${fmt(v - m.goal)}${unit} over target` : `${fmt(m.goal - v)}${unit} left`} · ${Math.round((v / m.goal) * 100)}%`;
        return (
          <div
            className={cx(c.goal, macros.length > 2 && c.goalTight)}
            key={m.key}
            data-macro={m.key}
          >
            <div className={u.row}>
              <span className={u.label}>{m.label}</span>
              <b className={u.value}>
                {m.eaten == null ? '—' : fmt(v)}
                <span className={u.unit}>{` / ${fmt(m.goal)}${unit}`}</span>
              </b>
            </div>
            <Bar
              big={macros.length <= 2}
              fraction={v / m.goal}
              color={
                m.kind === 'limit' && over
                  ? 'var(--bad)'
                  : m.kind === 'target' && v >= m.goal
                    ? 'var(--info)'
                    : m.color
              }
            />
            <small>{status}</small>
          </div>
        );
      })}
    </Card>
  );
}
