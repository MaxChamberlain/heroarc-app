import type { Snapshot } from '@heroarc/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { api, orpc } from '../../lib/orpc';
import { THEME_ORDER, THEMES } from '../../themes/registry';
import { useTheme } from '../../themes/ThemeProvider';
import { heroSvg } from '../board/art';
import { GoalsForm } from '../board/cards/GoalsCard';
import { DashboardProvider, snapshotKey, useDashboard } from '../board/DashboardContext';
import h from '../board/Hero.module.css';
import { cx, eventId } from '../board/lib';
import u from '../board/ui.module.css';
import { Field, zones } from './AuthPages';
import { ImportSection } from './Import';
import o from './Onboarding.module.css';
import { OuraPanel, useOuraStatus } from './Oura';
import { useSaveTheme } from './theme';

const STEPS = ['You', 'Look', 'Goals', 'Habits', 'Connect'] as const;
const noop = () => {};

const SUGGESTED_HABITS = [
  'Walk 10,000 steps',
  'Drink 8 glasses of water',
  'Stretch 10 minutes',
  'No added sugar',
  'Read 20 minutes',
  'In bed by 11',
  'Meditate 5 minutes',
  'Take vitamins',
];
const MAX_HABITS = 8;

/** A habit id from its name (the API takes a-z, 0-9, - and _). */
function habitId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'habit';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

/**
 * First run, after confirming the email: who you are, how HeroArc looks, your goals, the
 * habits to track, then importing from the old HeroArc and meeting Coach. Each step saves as
 * it goes; the last one marks onboarding done.
 */
export function OnboardingPage() {
  const nav = useNavigate();
  const me = useQuery({ ...orpc.account.me.queryOptions(), retry: false });
  const snapshot = useQuery({
    ...orpc.legacy.data.queryOptions(),
    enabled: !!me.data,
    staleTime: Number.POSITIVE_INFINITY,
  });
  // Back from Oura's sign-in, onboarding resumes at its Connect step.
  const [step, setStep] = useState(() =>
    new URLSearchParams(window.location.search).get('step') === 'connect' ? STEPS.length - 1 : 0,
  );
  useEffect(() => {
    if (me.isError) void nav({ to: '/sign-in' });
  }, [me.isError, nav]);

  const next = () => {
    setStep((n) => Math.min(n + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  };
  const back = () => setStep((n) => Math.max(n - 1, 0));

  return (
    <main className={o.page}>
      <div className={o.card}>
        <p className={o.brand}>HeroArc</p>
        <ol className={o.steps} aria-label="Setup steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={cx(o.step, i < step && o.done, i === step && o.current)}
              aria-current={i === step ? 'step' : undefined}
            >
              {label}
            </li>
          ))}
        </ol>
        {!me.data || (step >= 2 && !snapshot.data) ? (
          <p className={u.note} role="status">
            Loading…
          </p>
        ) : step === 0 ? (
          <AboutYou name={me.data.name} onNext={next} />
        ) : step === 1 ? (
          <PickTheme onNext={next} onBack={back} />
        ) : (
          <DashboardProvider data={snapshot.data as Snapshot} toast={noop}>
            {step === 2 ? (
              <GoalsStep onNext={next} onBack={back} />
            ) : step === 3 ? (
              <HabitsStep onNext={next} onBack={back} />
            ) : (
              <ConnectStep onBack={back} />
            )}
          </DashboardProvider>
        )}
      </div>
    </main>
  );
}

function Step({ title, lede, children }: { title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <section className={o.body}>
      <h1 className={o.title}>{title}</h1>
      <p className={o.lede}>{lede}</p>
      {children}
    </section>
  );
}

function Nav({ onBack, next }: { onBack?: () => void; next: ReactNode }) {
  return (
    <div className={o.nav}>
      {onBack ? (
        <button type="button" className={u.btn} onClick={onBack}>
          Back
        </button>
      ) : (
        <span />
      )}
      {next}
    </div>
  );
}

/** 1 · Name and timezone. */
function AboutYou({ name: initial, onNext }: { name: string; onNext: () => void }) {
  const [name, setName] = useState(initial);
  const [tz, setTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await api.account.updateMe({ name: name.trim(), timezone: tz });
    setBusy(false);
    onNext();
  };
  return (
    <Step
      title="Welcome to HeroArc"
      lede="A few quick things, then your dashboard. Everything here can be changed later."
    >
      <form className={o.form} onSubmit={(e) => void submit(e)}>
        <Field
          label="What should we call you?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label className={u.field}>
          <span className={u.fieldLabel}>Your timezone (when your day starts and ends)</span>
          <select className={u.select} value={tz} onChange={(e) => setTz(e.target.value)}>
            {zones().map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <Nav
          next={
            <button type="submit" className={u.primary} disabled={busy || !name.trim()}>
              Next
            </button>
          }
        />
      </form>
    </Step>
  );
}

/** 2 · Theme: each option shown in its own colours, with its hero. */
function PickTheme({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { id } = useTheme();
  const save = useSaveTheme();
  return (
    <Step
      title="Pick your look"
      lede="Simple is a clean dashboard. The others turn your week into a hero who gains gear as you sleep, eat, move and train well."
    >
      <fieldset className={o.themes}>
        <legend className={o.hidden}>Theme</legend>
        {THEME_ORDER.map((tid) => {
          const t = THEMES[tid];
          return (
            <button
              key={tid}
              type="button"
              aria-pressed={id === tid}
              className={o.theme}
              data-theme={tid}
              data-pick-theme={tid}
              onClick={() => save(tid)}
            >
              <span
                className={cx(h.hero, h.figure, o.figure)}
                aria-hidden="true"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: hero SVG built from theme constants and numbers (no user text).
                dangerouslySetInnerHTML={{
                  __html: heroSvg(
                    { helm: 1, armor: 1, legs: 0.6, blade: 0.4, aura: 0.7 },
                    t.hero,
                    `ob${tid}`,
                  ),
                }}
              />
              <span className={o.themeName}>{t.name}</span>
              <span className={o.themeHero}>{t.hero.name}</span>
            </button>
          );
        })}
      </fieldset>
      <Nav
        onBack={onBack}
        next={
          <button type="button" className={u.primary} onClick={onNext}>
            {`Next: ${THEMES[id].name} it is`}
          </button>
        }
      />
    </Step>
  );
}

/** 3 · Goals: the calculator, or the starter numbers for now. */
function GoalsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <Step
      title="Your daily goals"
      lede="Calories and protein to aim for (and fat and carbs, if you like). Fill in a few details to work them out, or keep the starter numbers for now."
    >
      <div className={o.panel}>
        <GoalsForm onDone={onNext} />
      </div>
      <Nav
        onBack={onBack}
        next={
          <button type="button" className={u.btn} data-goals-skip="1" onClick={onNext}>
            Keep the starter numbers
          </button>
        }
      />
    </Step>
  );
}

/** 4 · Habits: pick from suggestions or write your own (up to 8). */
function HabitsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data } = useDashboard();
  const qc = useQueryClient();
  const existing = data.habits?.list ?? [];
  const [chosen, setChosen] = useState<string[]>(() => existing.map((x) => x.n));
  const [own, setOwn] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const options = [...new Set([...SUGGESTED_HABITS, ...chosen])];
  const full = chosen.length >= MAX_HABITS;

  const toggle = (n: string) => {
    setMsg('');
    setChosen((c) =>
      c.includes(n) ? c.filter((x) => x !== n) : c.length >= MAX_HABITS ? c : [...c, n],
    );
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const n = own.trim().slice(0, 30);
    if (!n) return;
    if (full) {
      setMsg(`Up to ${MAX_HABITS} habits; untick one to add another.`);
      return;
    }
    if (!chosen.includes(n)) setChosen((c) => [...c, n]);
    setOwn('');
  };
  const save = async () => {
    if (!chosen.length) return onNext();
    setBusy(true);
    setMsg('');
    // Keep the ids of habits the account already has; hide the ones unticked (history stays).
    const byName = new Map(existing.map((x) => [x.n, x.id]));
    const taken = new Set([...existing, ...(data.habits?.archived ?? [])].map((x) => x.id));
    const list = [
      ...chosen.map((n) => ({ id: byName.get(n) ?? habitId(n, taken), n, a: 0 as const })),
      ...existing
        .filter((x) => !chosen.includes(x.n))
        .map((x) => ({ id: x.id, n: x.n, a: 1 as const })),
      ...(data.habits?.archived ?? []).map((x) => ({ id: x.id, n: x.n, a: 1 as const })),
    ];
    try {
      await api.legacy.habitConfig({ id: eventId('c'), list });
      await qc.invalidateQueries({ queryKey: snapshotKey() });
      onNext();
    } catch {
      setMsg("Couldn't save. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <Step
      title="Habits to track"
      lede={`Tick off a few small things each day; they count towards your hero. Choose up to ${MAX_HABITS}.`}
    >
      <fieldset className={o.chips}>
        <legend className={o.hidden}>Habits</legend>
        {options.map((n) => (
          <button
            key={n}
            type="button"
            className={o.chip}
            aria-pressed={chosen.includes(n)}
            disabled={full && !chosen.includes(n)}
            onClick={() => toggle(n)}
          >
            {n}
          </button>
        ))}
      </fieldset>
      <form className={u.inline} onSubmit={add}>
        <input
          className={u.input}
          maxLength={30}
          placeholder="Or write your own"
          aria-label="Your own habit"
          value={own}
          onChange={(e) => setOwn(e.target.value)}
        />
        <button type="submit" className={u.btn} disabled={!own.trim()}>
          Add
        </button>
      </form>
      {msg && (
        <p className={u.note} role="alert">
          {msg}
        </p>
      )}
      <Nav
        onBack={onBack}
        next={
          <button
            type="button"
            className={u.primary}
            disabled={busy}
            data-habits-save="1"
            onClick={() => void save()}
          >
            {chosen.length
              ? `Track ${chosen.length} habit${chosen.length === 1 ? '' : 's'}`
              : 'Skip for now'}
          </button>
        }
      />
    </Step>
  );
}

const OURA_RESULT: Record<string, string> = {
  connected: 'Connected. HeroArc is fetching your Oura history.',
  cancelled: "Oura wasn't connected. You can do it later in Settings.",
  expired: 'That took too long. Try again.',
  error: "Couldn't connect Oura. Try again, or later in Settings.",
};

/** Oura, if HeroArc has an Oura application. */
function OnboardingOura() {
  const q = useOuraStatus();
  const [result] = useState(() => new URLSearchParams(window.location.search).get('oura'));
  if (!q.data?.available) return null;
  return (
    <div className={o.panel}>
      <div className={u.caps}>Oura</div>
      {result && OURA_RESULT[result] && (
        <p className={u.note} role="status">
          {OURA_RESULT[result]}
        </p>
      )}
      <OuraPanel returnTo="onboarding" />
    </div>
  );
}

/** 5 · Bring things in, meet Coach, then the dashboard. */
function ConnectStep({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    await api.account.updateMe({ onboarded: true });
    window.location.assign('/');
  };
  return (
    <Step title="Bring things in" lede="All optional. You'll find these again in Settings.">
      <div className={o.panel}>
        <ImportSection />
      </div>
      <OnboardingOura />
      <div className={o.panel}>
        <div className={u.caps}>Meet Coach</div>
        <p className={u.note}>
          Coach sits beside your dashboard. Tell it what you ate, snap your plate or send a voice
          note and it logs it for you; ask how your week went; or have it rearrange the dashboard.
          Press <kbd>/</kbd> anywhere to talk to it.
        </p>
      </div>
      <Nav
        onBack={onBack}
        next={
          <button type="button" className={u.primary} disabled={busy} onClick={() => void finish()}>
            Go to my dashboard
          </button>
        }
      />
    </Step>
  );
}
