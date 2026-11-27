import type { ImportSummary } from '@heroarc/contracts';
import { useRef, useState } from 'react';
import { api } from '../../lib/orpc';
import { useDashboard } from '../board/DashboardContext';
import { cx } from '../board/lib';
import u from '../board/ui.module.css';
import s from './Connections.module.css';

const fmt = (n: number) => n.toLocaleString('en-US');
const range = (from: string | null, to: string | null) =>
  from && to ? (from === to ? from : `${from} to ${to}`) : '';

function Summary({ sum, verb }: { sum: ImportSummary; verb: 'new' | 'added' }) {
  return (
    <div className={s.list} data-import-summary={verb}>
      {sum.tabs.map((t) => (
        <div className={u.row} key={t.tab} data-import-tab={t.tab}>
          <span>
            <b>{t.tab}</b>
            <span className={u.muted}>
              {` · ${fmt(t.entries)} ${t.entries === 1 ? 'entry' : 'entries'}${range(t.from, t.to) ? ` · ${range(t.from, t.to)}` : ''}`}
            </span>
            {t.problems.length > 0 && (
              <small className={cx(u.muted, s.problems)}>
                {`${fmt(t.skipped)} skipped: ${t.problems.join('; ')}${t.skipped > t.problems.length ? '; …' : ''}`}
              </small>
            )}
          </span>
          <span data-import-new={t.new}>{`${fmt(t.new)} ${verb}`}</span>
        </div>
      ))}
      {sum.notes.map((n) => (
        <p className={u.note} key={n}>
          {n}
        </p>
      ))}
    </div>
  );
}

/**
 * Settings → Import from the old HeroArc: the original Google Sheet, downloaded as .xlsx.
 * Preview first; importing again later only adds what's new.
 */
export function ImportSection() {
  const { reload } = useDashboard();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [done, setDone] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError('');
    if (input.current) input.current.value = '';
  };
  const choose = async (f: File | undefined) => {
    if (!f) return;
    reset();
    setDone(null);
    setBusy(true);
    try {
      setPreview(await api.import.preview({ file: f }));
      setFile(f);
    } catch (e) {
      setError((e as Error).message || "Couldn't read that file.");
    }
    setBusy(false);
  };
  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.import.run({ file });
      reset();
      setDone(result);
      await reload();
    } catch (e) {
      setError((e as Error).message || 'The import failed; nothing was changed.');
    }
    setBusy(false);
  };

  return (
    <>
      <div className={u.caps}>Import from the old HeroArc</div>
      <p className={u.note}>
        In the old HeroArc's Google Sheet, choose File → Download → Microsoft Excel (.xlsx), then
        pick that file here. You'll see what it adds before anything is saved, and importing again
        later only adds what's new.
      </p>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        aria-label="Old HeroArc sheet (.xlsx)"
        data-import-file="1"
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      {!preview && (
        <button
          type="button"
          className={u.btn}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Reading…' : 'Choose the .xlsx file'}
        </button>
      )}
      {error && (
        <p className={u.note} role="alert">
          {error}
        </p>
      )}
      {preview && (
        <>
          <Summary sum={preview} verb="new" />
          <div className={u.inline}>
            <button type="button" className={u.btn} disabled={busy} onClick={reset}>
              Cancel
            </button>
            <button
              type="button"
              className={u.primary}
              disabled={busy || preview.total === 0}
              data-import-run="1"
              onClick={() => void run()}
            >
              {busy
                ? 'Importing…'
                : preview.total === 0
                  ? 'Nothing new to import'
                  : `Import ${fmt(preview.total)} ${preview.total === 1 ? 'entry' : 'entries'}`}
            </button>
          </div>
        </>
      )}
      {done && (
        <>
          <p className={u.note} role="status">
            <b>{`Imported ${fmt(done.total)} ${done.total === 1 ? 'entry' : 'entries'}.`}</b>
          </p>
          <Summary sum={done} verb="added" />
        </>
      )}
    </>
  );
}
