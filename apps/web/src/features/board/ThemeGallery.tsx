import type { Snapshot } from '@heroarc/contracts';
import { CARD_IDS } from '@heroarc/contracts';
import { useQuery } from '@tanstack/react-query';
import { orpc } from '../../lib/orpc';
import { THEME_ORDER, THEMES } from '../../themes/registry';
import { ThemeProvider } from '../../themes/ThemeProvider';
import type { ThemeId } from '../../themes/types';
import { type HeroFill, heroSvg } from './art';
import { AutoHeightContext, tileClass } from './Card';
import { BOARD_CARDS } from './cards';
import { DashboardProvider } from './DashboardContext';
import s from './Gallery.module.css';
import h from './Hero.module.css';
import { cx } from './lib';

const STATES: Array<[string, HeroFill]> = [
  ['No progress', { helm: 0, armor: 0, legs: 0, blade: 0, aura: 0 }],
  ['Partway', { helm: 1, armor: 0.5, legs: 0.25, blade: 0, aura: 0.4 }],
  ['All forged', { helm: 1, armor: 1, legs: 1, blade: 1, aura: 1 }],
];
const noop = () => {};

/**
 * Review page: every card, the hero in three states, in every theme, on today's data.
 * Page-level layers (backdrop, scanlines, grain) only show for the theme you're using.
 */
export function ThemeGallery() {
  const snapshot = useQuery({
    ...orpc.legacy.data.queryOptions(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!snapshot.data) return <p style={{ padding: 24 }}>Loading…</p>;
  return (
    <div className={s.page}>
      <nav className={s.nav} aria-label="Themes">
        {THEME_ORDER.map((id) => (
          <a key={id} href={`#${id}`}>
            {THEMES[id].name}
          </a>
        ))}
      </nav>
      {THEME_ORDER.map((id) => (
        <ThemeSection key={id} id={id} data={snapshot.data} />
      ))}
    </div>
  );
}

function ThemeSection({ id, data }: { id: ThemeId; data: Snapshot }) {
  const theme = THEMES[id];
  return (
    <section className={s.section} data-theme={id} id={id} aria-label={theme.name}>
      <ThemeProvider initial={id}>
        <DashboardProvider data={data} toast={noop}>
          <div className={s.head}>
            <h2>{theme.name}</h2>
            <div className={s.figures}>
              {STATES.map(([label, fill]) => (
                <div className={cx(s.figure, h.hero, h.figure)} key={label}>
                  <span
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: hero SVG built from theme constants and numbers (no user text).
                    dangerouslySetInnerHTML={{
                      __html: heroSvg(fill, theme.hero, `g${id}${label.length}`),
                    }}
                  />
                  {label}
                </div>
              ))}
            </div>
          </div>
          <AutoHeightContext.Provider value={true}>
            <div className={s.grid}>
              {CARD_IDS.map((cid) => {
                const C = BOARD_CARDS[cid].Component;
                return (
                  <div key={cid} className={tileClass}>
                    <C />
                  </div>
                );
              })}
            </div>
          </AutoHeightContext.Provider>
        </DashboardProvider>
      </ThemeProvider>
    </section>
  );
}
