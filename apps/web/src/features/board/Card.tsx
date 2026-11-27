import { createContext, type ReactNode, useContext, useId } from 'react';
import s from './Card.module.css';
import { cx } from './lib';

/** Class for anything that holds one card on the board (counts for swatches and tags). */
export const tileClass = s.tile;

/** True when cards size to their content (phone and tablet stacks, sheets). */
export const AutoHeightContext = createContext(false);

interface CardProps {
  /** Card title (plain text, or text plus a small control). */
  title: ReactNode;
  /** Small controls at the right of the title row (e.g. a view toggle). */
  actions?: ReactNode;
  /** Buttons along the bottom (e.g. "Edit goals"). */
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
  /** For tests and the customize panel. */
  id?: string;
  /** A slim strip with no visible title (the meter card). */
  compact?: boolean;
}

/**
 * The frame every board card uses: title row, body and optional footer, plus the theme's
 * decorations. On the board the body scrolls inside the tile if a tile is made very small;
 * long content (editors, month views) opens in a Sheet instead.
 */
export function Card({ title, actions, footer, className, children, id, compact }: CardProps) {
  const auto = useContext(AutoHeightContext);
  const titleId = useId();
  return (
    <section
      className={cx(s.card, auto && s.auto, compact && s.compact, className)}
      aria-labelledby={titleId}
      data-card={id}
    >
      <span className={s.band} aria-hidden="true" />
      <span className={s.corners} aria-hidden="true" />
      <span className={s.led} aria-hidden="true" />
      <span className={s.tag} aria-hidden="true" />
      <header className={s.head}>
        <h2 className={s.title} id={titleId}>
          <span>{title}</span>
        </h2>
        {actions && <div className={s.actions}>{actions}</div>}
      </header>
      <div className={s.body}>{children}</div>
      {footer && <footer className={s.foot}>{footer}</footer>}
    </section>
  );
}
