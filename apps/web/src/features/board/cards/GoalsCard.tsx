import type { ActivityLevel, GoalInputs, GoalType, Sex } from '@heroarc/domain';
import { calculateGoals } from '@heroarc/domain';
import { useState } from 'react';
import { Card } from '../Card';
import { useDashboard } from '../DashboardContext';
import { cx, eventId, fmt } from '../lib';
import { useOpenCard } from '../openCard';
import { Sheet } from '../Sheet';
import u from '../ui.module.css';
import c from './cards.module.css';

interface Form {
  sex: Sex;
  age: string;
  height: string;
  weight: string;
  activity: ActivityLevel;
  goal: GoalType;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  trackMacros: boolean;
}

const SEXES: Sex[] = ['female', 'male'];
const ACTIVITIES: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very active'];
const GOALS: GoalType[] = ['lose', 'maintain', 'gain'];
const cap = (s: string) => s[0]?.toUpperCase() + s.slice(1);
const str = (v: number | null | undefined) => (v == null ? '' : String(v));

/** Calorie and protein goals; the calculator opens in a drawer. */
export function GoalsCard() {
  const { data } = useDashboard();
  const [open, setOpen] = useState(false);
  useOpenCard('goals', () => setOpen(true));
  const G = data.goals;
  const set = !!(G.kcal && G.protein && G.goalsSet);
  return (
    <Card
      title="Goals"
      footer={
        <button type="button" className={u.btn} data-goals-open="1" onClick={() => setOpen(true)}>
          {set ? 'Edit goals' : 'Set goals'}
        </button>
      }
    >
      <div className={c.summary}>
        {(
          [
            ['Calories', G.kcal],
            ['Protein (g)', G.protein],
            ...(G.trackMacros
              ? ([
                  ['Carbs (g)', G.carbs],
                  ['Fat (g)', G.fat],
                ] as const)
              : []),
          ] as const
        ).map(([label, v]) => (
          <div key={label} data-goal={label}>
            <div className={u.label}>{label}</div>
            <b className={u.big}>{v ? fmt(v) : '—'}</b>
          </div>
        ))}
      </div>
      {!set && (
        <p className={u.note} style={{ marginTop: 10 }}>
          These are starter numbers. Tap Set goals to calculate yours.
        </p>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Your goals">
        <GoalsForm onDone={() => setOpen(false)} />
      </Sheet>
    </Card>
  );
}

/** Mifflin-St Jeor calculator plus the goals themselves (an estimate, not medical advice). */
/** The goals calculator and form (the Goals card's drawer, and onboarding). */
export function GoalsForm({ onDone }: { onDone: () => void }) {
  const { data, patch, toast, api } = useDashboard();
  const G = data.goals;
  const [form, setForm] = useState<Form>(() => {
    const f = data.goalsForm;
    const lastWeight = Object.keys(data.days)
      .sort()
      .map((k) => data.days[k]?.weight)
      .filter((w): w is number => w != null)
      .at(-1);
    return {
      sex: f?.sex ?? 'female',
      age: str(f?.age),
      height: str(f?.height),
      weight: str(f?.weight ?? lastWeight),
      activity: f?.activity ?? 'light',
      goal: f?.goal ?? 'maintain',
      kcal: str(f?.kcal ?? G.kcal),
      protein: str(f?.protein ?? G.protein),
      carbs: str(f?.carbs ?? G.carbs),
      fat: str(f?.fat ?? G.fat),
      trackMacros: G.trackMacros,
    };
  });
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>({ text: '', ok: false });
  const [busy, setBusy] = useState(false);

  const inputs = (): GoalInputs | null =>
    form.age && form.height && form.weight
      ? {
          sex: form.sex,
          age: Number(form.age),
          height: Number(form.height),
          weight: Number(form.weight),
          activity: form.activity,
          goal: form.goal,
        }
      : null;
  const i0 = inputs();
  const est = i0 ? calculateGoals(i0) : null;
  const upd = (k: Exclude<keyof Form, 'trackMacros'>, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const calculate = () => {
    const i = inputs();
    if (!i) {
      setMsg({ text: 'Add age, height and weight first.', ok: false });
      return;
    }
    const r = calculateGoals(i);
    setForm((f) => ({
      ...f,
      kcal: String(r.kcal),
      protein: String(r.protein),
      carbs: String(r.carbs),
      fat: String(r.fat),
    }));
    setMsg({ text: 'Filled in. Change the numbers if you like, then save.', ok: true });
  };

  const save = async () => {
    if (busy) return;
    const f = {
      id: eventId('g'),
      sex: form.sex,
      age: Number(form.age),
      height: Number(form.height),
      weight: Number(form.weight),
      activity: form.activity,
      goal: form.goal,
      kcal: Number(form.kcal),
      protein: Number(form.protein),
      trackMacros: form.trackMacros,
      // Fat and carbs are only sent while tracked (otherwise the saved values are kept).
      ...(form.trackMacros && { carbs: Number(form.carbs), fat: Number(form.fat) }),
    };
    const bad = !(f.age >= 14 && f.age <= 100)
      ? 'Age looks off.'
      : !(f.height >= 48 && f.height <= 90)
        ? 'Height should be in inches (48 to 90).'
        : !(f.weight >= 70 && f.weight <= 500)
          ? 'Weight looks off.'
          : !(f.kcal >= 1000 && f.kcal <= 6000)
            ? 'Calories should be 1,000 to 6,000.'
            : !(f.protein >= 40 && f.protein <= 400)
              ? 'Protein should be 40 to 400 g.'
              : f.carbs !== undefined && !(f.carbs >= 20 && f.carbs <= 800)
                ? 'Carbs should be 20 to 800 g.'
                : f.fat !== undefined && !(f.fat >= 10 && f.fat <= 300)
                  ? 'Fat should be 10 to 300 g.'
                  : '';
    if (bad) {
      setMsg({ text: bad, ok: false });
      return;
    }
    setBusy(true);
    try {
      await api.legacy.goals(f);
      patch((s) => {
        const carbs = f.carbs ?? s.goals.carbs;
        const fat = f.fat ?? s.goals.fat;
        s.goals = {
          ...s.goals,
          kcal: f.kcal,
          protein: f.protein,
          carbs,
          fat,
          trackMacros: f.trackMacros,
          goalsSet: true,
        };
        s.goalsForm = { ...f, carbs, fat };
      });
      toast('Goals saved. Your app and food log use these now.');
      onDone();
    } catch {
      setMsg({ text: "Couldn't save. Check your connection and try again.", ok: false });
    }
    setBusy(false);
  };

  const select = (k: 'sex' | 'activity' | 'goal', label: string, opts: string[]) => (
    <label className={u.field}>
      <span className={u.fieldLabel}>{label}</span>
      <select
        className={u.select}
        data-gf={k}
        value={form[k]}
        onChange={(e) => upd(k, e.target.value)}
      >
        {opts.map((o) => (
          <option key={o} value={o}>
            {cap(o)}
          </option>
        ))}
      </select>
    </label>
  );
  const input = (
    k: 'age' | 'height' | 'weight' | 'kcal' | 'protein' | 'carbs' | 'fat',
    label: string,
    ph: string,
  ) => (
    <label className={u.field}>
      <span className={u.fieldLabel}>{label}</span>
      <input
        className={u.input}
        data-gf={k}
        inputMode="decimal"
        placeholder={ph}
        value={form[k]}
        onChange={(e) => upd(k, e.target.value)}
      />
    </label>
  );

  return (
    <div className={u.stack}>
      <p className={u.note}>
        Fill in the calculator for a starting point, or type your own numbers below.
      </p>
      <div className={u.split}>
        {select('sex', 'Sex', SEXES)}
        {input('age', 'Age', 'years')}
        {input('height', 'Height (inches)', 'e.g. 65')}
        {input('weight', 'Weight (lb)', 'e.g. 150')}
      </div>
      {select('activity', 'Activity', ACTIVITIES)}
      {select('goal', 'Goal', GOALS)}
      <div className={u.actions}>
        <button type="button" className={u.btn} data-gcalc="1" onClick={calculate}>
          Calculate
        </button>
      </div>
      <p className={u.note}>
        {est
          ? `Estimate: about ${fmt(est.kcal)} kcal and ${est.protein} g protein a day${form.trackMacros ? `, with ${est.carbs} g carbs and ${est.fat} g fat` : ''} (resting burn about ${fmt(est.bmr)}). It is a starting point, not medical advice.`
          : 'Fill in age, height and weight, then tap Calculate.'}
      </p>
      <hr className={u.sep} />
      <div className={u.split}>
        {input('kcal', 'Your calorie goal', 'kcal')}
        {input('protein', 'Your protein goal (g)', 'grams')}
      </div>
      <label className={u.switchRow}>
        <span>
          <b>Track fat and carbs</b>
          <small>Show them on Goals and Nutrition too.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={form.trackMacros}
          className={u.switch}
          data-track-macros="1"
          checked={form.trackMacros}
          onChange={(e) => setForm((f) => ({ ...f, trackMacros: e.target.checked }))}
        />
      </label>
      {form.trackMacros && (
        <div className={u.split}>
          {input('carbs', 'Your carbs goal (g)', 'grams')}
          {input('fat', 'Your fat goal (g)', 'grams')}
        </div>
      )}
      <div className={cx(u.msg, msg.ok ? u.good : u.warn)} role="status">
        {msg.text}
      </div>
      <div className={u.actions}>
        <button type="button" className={u.btn} onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className={u.primary}
          data-gsave="1"
          disabled={busy}
          onClick={() => void save()}
        >
          Save goals
        </button>
      </div>
    </div>
  );
}
