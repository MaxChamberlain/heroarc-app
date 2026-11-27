import { useRouterState } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import boardCss from '../features/board/board.css?raw';
import { DEFAULT_THEME, isThemeId, THEME_ORDER, THEMES } from './registry';
import type { ThemeDefinition, ThemeId } from './types';
import { THEME_VARS_CSS } from './vars';

/** The chosen theme lives in a cookie so the server renders the right one (no flash). */
export const THEME_COOKIE = 'heroarc_theme';

const readThemeCookie = createIsomorphicFn()
  .server(() => getCookie(THEME_COOKIE))
  .client(
    () =>
      document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${THEME_COOKIE}=`))
        ?.split('=')[1],
  );

/** The theme to render with: the cookie if valid, else the default. */
export function initialTheme(): ThemeId {
  const v = readThemeCookie();
  return isThemeId(v) ? v : DEFAULT_THEME;
}

interface ThemeContextValue {
  id: ThemeId;
  theme: ThemeDefinition;
  setTheme: (id: ThemeId) => void;
  /** Move through THEME_ORDER (Settings ‹ ›). */
  step: (n: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ initial, children }: { initial: ThemeId; children: ReactNode }) {
  const [id, setId] = useState<ThemeId>(initial);
  const setTheme = useCallback((next: ThemeId) => {
    setId(next);
    // biome-ignore lint/suspicious/noDocumentCookie: a plain first-party preference cookie.
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);
  const step = useCallback(
    (n: number) => {
      const i = THEME_ORDER.indexOf(id);
      const next = THEME_ORDER[(i + n + THEME_ORDER.length) % THEME_ORDER.length] ?? DEFAULT_THEME;
      setTheme(next);
    },
    [id, setTheme],
  );
  const value = useMemo(() => ({ id, theme: THEMES[id], setTheme, step }), [id, setTheme, step]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}

/**
 * The document's styles: every theme's variable list (only the one matching <html data-theme>
 * applies), the board's global stylesheet, and the theme's fonts. Server-rendered, so the right
 * theme shows with no flash.
 */
export function ThemeStyles() {
  const { theme } = useTheme();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // The theme gallery and onboarding's theme picker show every theme at once: every font.
  const fonts =
    path.startsWith('/dev/themes') || path === '/onboarding'
      ? THEME_ORDER.map((t) => THEMES[t].fonts).join('&')
      : theme.fonts;
  return (
    <>
      <meta name="theme-color" content={theme.deep} />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: first-party stylesheets bundled with the app. */}
      <style id="sTokens" dangerouslySetInnerHTML={{ __html: THEME_VARS_CSS }} />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: first-party stylesheets bundled with the app. */}
      <style id="sBoard" dangerouslySetInnerHTML={{ __html: boardCss }} />
      <link
        id="thFont"
        rel="stylesheet"
        href={`https://fonts.googleapis.com/css2?${fonts}&display=swap`}
      />
    </>
  );
}
