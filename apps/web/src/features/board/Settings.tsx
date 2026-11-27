import { THEME_ORDER, THEMES } from '../../themes/registry';
import { useTheme } from '../../themes/ThemeProvider';
import { ActivitySection, ConnectionsSection } from '../account/Connections';
import { ImportSection } from '../account/Import';
import { OuraSection } from '../account/Oura';
import { AccountSection, PeopleSection } from '../account/People';
import { useSaveTheme } from '../account/theme';
import s from './Settings.module.css';
import { Sheet } from './Sheet';
import u from './ui.module.css';

/** Settings: the theme, and a way into Customize. */
export function SettingsSheet({
  open,
  onClose,
  onCustomize,
}: {
  open: boolean;
  onClose: () => void;
  onCustomize: () => void;
}) {
  const { id } = useTheme();
  const setTheme = useSaveTheme();
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className={u.stack}>
        <div className={u.caps}>Theme</div>
        <div className={s.themes}>
          {THEME_ORDER.map((tid) => {
            const th = THEMES[tid];
            return (
              <button
                key={tid}
                type="button"
                className={s.theme}
                aria-pressed={tid === id}
                data-theme-pick={tid}
                onClick={() => setTheme(tid)}
              >
                <span className={s.swatches} aria-hidden="true">
                  {th.swatches.slice(0, 3).map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                {th.name}
                <small>{th.hero.name}</small>
              </button>
            );
          })}
        </div>
        <hr className={u.sep} />
        <AccountSection />
        <OuraSection />
        <PeopleSection />
        <ActivitySection />
        <ConnectionsSection />
        <hr className={u.sep} />
        <ImportSection />
        <hr className={u.sep} />
        <div className={u.caps}>Board</div>
        <p className={u.note}>
          Move, resize, hide and show cards. Your layout is saved to your account.
        </p>
        <div className={u.actions}>
          <button
            type="button"
            className={u.btn}
            onClick={() => {
              onClose();
              onCustomize();
            }}
          >
            Customize board
          </button>
        </div>
      </div>
    </Sheet>
  );
}
