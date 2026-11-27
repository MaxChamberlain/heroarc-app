import type { Layout } from '@heroarc/contracts';
import { normalizeLayout } from '@heroarc/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, orpc } from '../../lib/orpc';

const layoutKey = () => orpc.layout.get.queryKey();

/** The account's board layout, and an optimistic save that rolls back if the API refuses. */
export function useBoardLayout(enabled = true) {
  const qc = useQueryClient();
  const query = useQuery({
    ...orpc.layout.get.queryOptions(),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    enabled,
  });

  const save = useCallback(
    async (next: Layout): Promise<boolean> => {
      const prev = qc.getQueryData<Layout>(layoutKey());
      qc.setQueryData(layoutKey(), next);
      try {
        qc.setQueryData(layoutKey(), await api.layout.save(next));
        return true;
      } catch {
        qc.setQueryData(layoutKey(), prev);
        return false;
      }
    },
    [qc],
  );

  return {
    layout: query.data ? normalizeLayout(query.data) : null,
    isError: query.isError,
    save,
  };
}
