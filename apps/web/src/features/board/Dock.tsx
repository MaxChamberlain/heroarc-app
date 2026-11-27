import { useState } from 'react';
import { HabitToggles } from './cards/HabitsCard';
import { MoodCheckIn } from './cards/MoodCard';
import { useWeight, WeightEntry } from './cards/WeightCard';
import { useDashboard } from './DashboardContext';
import s from './Dock.module.css';
import { CheckIcon, ScaleIcon, SmileIcon, SparkIcon } from './icons';
import { Sheet } from './Sheet';
import u from './ui.module.css';

type Action = 'weight' | 'mood' | 'habits';

/** Phones: Coach first, then one-tap logging for the things logged most. */
export function Dock({ onCoach }: { onCoach: () => void }) {
  const [open, setOpen] = useState<Action | null>(null);
  const { today, isToday, setSel } = useDashboard();
  const { wt, vsPrev } = useWeight();
  const close = () => setOpen(null);
  return (
    <>
      <nav className={s.dock} aria-label="Quick actions">
        <button type="button" className={s.coach} data-quick="coach" onClick={onCoach}>
          <span>
            <SparkIcon size={22} />
          </span>
          Coach
        </button>
        <button type="button" data-quick="weight" onClick={() => setOpen('weight')}>
          <ScaleIcon />
          Weight
        </button>
        <button
          type="button"
          data-quick="mood"
          onClick={() => {
            if (!isToday) setSel(today);
            setOpen('mood');
          }}
        >
          <SmileIcon />
          Mood
        </button>
        <button type="button" data-quick="habits" onClick={() => setOpen('habits')}>
          <CheckIcon />
          Habits
        </button>
      </nav>
      <Sheet open={open === 'weight'} onClose={close} title="Log weight">
        <div className={u.stack}>
          <div className={u.row} style={{ border: 0 }}>
            <b className={u.big}>{wt == null ? '—' : `${wt.toFixed(1)} lb`}</b>
            <span className={u.label}>{vsPrev}</span>
          </div>
          <WeightEntry onSaved={close} />
        </div>
      </Sheet>
      <Sheet open={open === 'mood'} onClose={close} title="Mood check-in">
        <MoodCheckIn onLogged={close} />
      </Sheet>
      <Sheet open={open === 'habits'} onClose={close} title="Today's habits">
        <HabitToggles />
      </Sheet>
    </>
  );
}
