import { type ReactNode, useEffect, useId, useRef } from 'react';
import { AutoHeightContext } from './Card';
import { cx } from './lib';
import s from './Sheet.module.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Buttons pinned to the bottom (Save, Cancel). */
  footer?: ReactNode;
  /** A wider drawer on desktop (month grids, the plan editor). */
  wide?: boolean;
  /** Full height, and the content handles its own scrolling (Coach). */
  fill?: boolean;
}

/**
 * One responsive overlay for long content: a drawer from the right on tablet and desktop,
 * a bottom sheet on phones. A modal <dialog>: Esc or a tap outside closes it, focus stays
 * inside. Content mounts when opened, so every open starts fresh.
 */
export function Sheet({ open, onClose, title, children, footer, wide, fill }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.stopPropagation();
      }}
    >
      {open && (
        <div className={cx(s.panel, wide && s.wide, fill && s.fill)}>
          <header className={s.head}>
            <h2 id={titleId}>{title}</h2>
            <button type="button" className={s.close} aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </header>
          <div className={s.body}>
            <AutoHeightContext.Provider value={true}>{children}</AutoHeightContext.Provider>
          </div>
          {footer && <footer className={s.foot}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
