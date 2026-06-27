'use client';

/**
 * Single studio project (with its sessions) — used to restore a thread's mode
 * and outputs when the user selects it from the history sidebar. Hits the
 * org-scoped GET /api/v2/ai-studio/projects/[id] route.
 */

import useSWR from 'swr';
import type { StudioProject } from './types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useStudioProject(projectId: string | null | undefined) {
  const { data, error, isLoading, mutate } = useSWR<{ project: StudioProject }>(
    projectId ? `/api/v2/ai-studio/projects/${projectId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    project: data?.project ?? null,
    isLoading,
    error,
    refresh: mutate,
  };
}
