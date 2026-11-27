import type { Me } from '@heroarc/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { api, orpc } from '../../lib/orpc';
import { useTheme } from '../../themes/ThemeProvider';
import type { ThemeId } from '../../themes/types';

/**
 * Switch theme and remember it on the account, so it follows the person to every device.
 * (The cookie still makes this device's next page load render it with no flash.)
 */
export function useSaveTheme() {
  const { setTheme } = useTheme();
  const qc = useQueryClient();
  return useCallback(
    (id: ThemeId) => {
      setTheme(id);
      qc.setQueryData<Me>(orpc.account.me.queryKey(), (m) => (m ? { ...m, theme: id } : m));
      void api.account.updateMe({ theme: id }).catch(() => {});
    },
    [setTheme, qc],
  );
}

/** On a device that hasn't seen it yet, apply the account's theme. */
export function useAccountTheme(me: Me | undefined) {
  const { id, setTheme } = useTheme();
  // Only when the account's choice arrives or changes, not on every local switch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `id` is read, not watched (see above).
  useEffect(() => {
    if (me?.theme && me.theme !== id) setTheme(me.theme);
  }, [me?.theme, setTheme]);
}
