'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * SubNav badge counts.
 *
 * Fetches the cheap navigation counts map (`/api/v2/navigation/counts`) and
 * exposes it as `badgeKey → number`. The SubNav resolves each item's
 * `badgeKey` through `counts` and hides the badge when the value is 0/undefined.
 *
 * Refresh strategy: every 60s + on window focus (TanStack defaults), so the
 * badges stay reasonably live without polling aggressively.
 */
export type SubnavBadgeCounts = Record<string, number>;

interface CountsResponse {
  counts: SubnavBadgeCounts;
}

export function useSubnavBadges() {
  const { data } = useQuery<CountsResponse>({
    queryKey: ['navigation-counts'],
    queryFn: async () => {
      const res = await fetch('/api/v2/navigation/counts');
      if (!res.ok) throw new Error('Failed to fetch navigation counts');
      return res.json();
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    // Badges are non-critical chrome — never surface errors, just hide counts.
    retry: 1,
  });

  return data?.counts ?? {};
}
