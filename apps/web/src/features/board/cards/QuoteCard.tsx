import { quoteFor } from '@heroarc/domain';
import { Card } from '../Card';
import { useDashboard } from '../DashboardContext';
import { QUOTE_ICONS } from '../quote-icons';
import c from './cards.module.css';

/** "Thought for today": one public-domain quote per day, the same for everyone. */
export function QuoteCard() {
  const { sel } = useDashboard();
  const q = quoteFor(sel);
  return (
    <Card title="Thought for today">
      {q && (
        <div className={c.quote}>
          <svg
            className={c.quoteIcon}
            viewBox="0 0 48 48"
            width="40"
            height="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: quote icon SVG constant.
            dangerouslySetInnerHTML={{ __html: QUOTE_ICONS[q.icon] ?? '' }}
          />
          <figure>
            <blockquote>{`“${q.text}”`}</blockquote>
            <figcaption>
              <b>{q.author}</b>
              <small>{`${q.source}${q.translator ? ` · ${q.translator}` : ''}`}</small>
            </figcaption>
          </figure>
        </div>
      )}
    </Card>
  );
}
