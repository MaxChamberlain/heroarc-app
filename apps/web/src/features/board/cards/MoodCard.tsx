import { useState } from 'react';
import { alchemistFaceSvg, moodFaceSvg } from '../art';
import { Card } from '../Card';
import { useDashboard } from '../DashboardContext';
import { clockTime, eventId } from '../lib';
import u from '../ui.module.css';
import c from './cards.module.css';

const LABELS = ['', 'Low', 'Meh', 'Okay', 'Good', 'Great'];

/** Tap a face (1–5), add a note, Log. Today only; entries are only ever added. */
export function MoodCheckIn({ onLogged }: { onLogged?: () => void }) {
  const { today, patch, toast, theme, api } = useDashboard();
  const [m, setM] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const engraved = theme.variants.moodFace === 'engraved';
  const face = (n: number) => (engraved ? alchemistFaceSvg(n, '') : moodFaceSvg(n));

  const log = async () => {
    if (busy || !m) return;
    const n = note.trim().slice(0, 200);
    setBusy(true);
    try {
      await api.legacy.mood({ id: eventId('m'), d: today, m, n });
      patch((s) => {
        if (!s.mood) return;
        const day = s.mood.log[today] ?? [];
        day.push({ t: clockTime(new Date()), m, n });
        s.mood.log[today] = day;
      });
      setM(0);
      setNote('');
      toast('Thanks for sharing.');
      onLogged?.();
    } catch {
      toast("Couldn't save that. Check your connection and tap Log again.");
    }
    setBusy(false);
  };

  return (
    <div>
      <div className={u.label}>How are you feeling right now?</div>
      <div className={c.faces}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={c.face}
            data-mood={n}
            aria-pressed={m === n}
            aria-label={`${n} ${LABELS[n]}`}
            onClick={() => setM(m === n ? 0 : n)}
          >
            <span
              // biome-ignore lint/security/noDangerouslySetInnerHtml: face SVGs are constants (no user text).
              dangerouslySetInnerHTML={{ __html: face(n) }}
            />
            {LABELS[n]}
          </button>
        ))}
      </div>
      <div className={u.inline}>
        <input
          className={u.input}
          type="text"
          maxLength={200}
          placeholder="Add a note (optional)"
          aria-label="Mood note"
          data-mood-note="1"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void log();
            }
          }}
        />
        <button
          type="button"
          className={u.primary}
          data-mood-log="1"
          disabled={!m || busy}
          onClick={() => void log()}
        >
          Log
        </button>
      </div>
    </div>
  );
}

/** Mood check-in card. On past days it points back to today (check-ins are for now). */
export function MoodCard() {
  const { data, today, isToday, setSel } = useDashboard();
  const logged = (data.mood?.log[today] ?? []).length;
  if (!isToday)
    return (
      <Card title="Mood">
        <div className={u.empty}>
          Check-ins are for how you feel right now.
          <button type="button" className={u.btn} onClick={() => setSel(today)}>
            Go to today
          </button>
        </div>
      </Card>
    );
  return (
    <Card title="Mood">
      <div className={u.stack}>
        {logged > 0 && (
          <div
            className={u.done}
          >{`✓ Logged ${logged === 1 ? 'once' : `${logged} times`} today. Thank you.`}</div>
        )}
        <MoodCheckIn />
        <p className={u.note}>
          {logged
            ? 'Add another any time.'
            : 'Tap a face whenever you like. There are no wrong answers.'}
        </p>
      </div>
    </Card>
  );
}
