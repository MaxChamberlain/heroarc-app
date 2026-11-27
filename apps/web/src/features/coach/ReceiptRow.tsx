import type { Receipt } from '@heroarc/contracts';
import { type ReactNode, useState } from 'react';
import { cx } from '../board/lib';
import u from '../board/ui.module.css';
import s from './Coach.module.css';

export type ActKind = 'confirm' | 'cancel' | 'undo';

/** Something an agent did (Undo) or proposes (Apply / Cancel). Used by Coach and Agent activity. */
export function ReceiptRow({
  r,
  act,
  meta,
}: {
  r: Receipt;
  act: (kind: ActKind) => Promise<void>;
  /** Extra line under the summary ("Hermes · 2 h ago"). */
  meta?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (kind: ActKind) => {
    setBusy(true);
    await act(kind);
    setBusy(false);
  };
  return (
    <div
      className={cx(s.receipt, r.status === 'pending' && s.proposal)}
      data-receipt={r.status}
      data-tool={r.tool}
      data-action={r.actionId}
    >
      <span className={s.rIcon} aria-hidden="true">
        {r.status === 'pending' ? '?' : r.status === 'applied' ? '✓' : '↺'}
      </span>
      <span className={cx(s.rText, (r.status === 'undone' || r.status === 'cancelled') && s.rOff)}>
        {r.summary}
        {meta && (
          <>
            <br />
            <small className={u.muted}>{meta}</small>
          </>
        )}
      </span>
      <span className={s.rActs}>
        {r.status === 'applied' && (
          <button type="button" className={u.link} disabled={busy} onClick={() => void run('undo')}>
            Undo
          </button>
        )}
        {r.status === 'pending' && (
          <>
            <button
              type="button"
              className={cx(u.btn, u.small)}
              disabled={busy}
              onClick={() => void run('cancel')}
            >
              Cancel
            </button>
            <button
              type="button"
              className={cx(u.primary, u.small)}
              disabled={busy}
              onClick={() => void run('confirm')}
            >
              Apply
            </button>
          </>
        )}
        {r.status === 'undone' && <small>Undone</small>}
        {r.status === 'cancelled' && <small>Cancelled</small>}
      </span>
    </div>
  );
}
