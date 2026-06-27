'use client';

/**
 * Studio project history — brand-scoped list + create/rename/archive.
 *
 * This is the new history backbone (replaces `useConversations` for new work).
 * The list is scoped to the active brand from `useCurrentBrand()`; create always
 * stamps the active brand so the asset-library bridge doesn't silently no-op
 * (it only imports when the project has a `brandId`).
 */

import useSWR from 'swr';
import { useCallback, useMemo } from 'react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import type { StudioKind, StudioProject } from './types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface UseStudioProjectsOptions {
  kind?: StudioKind;
  status?: 'active' | 'archived';
}

interface CreateProjectInput {
  name: string;
  kind: StudioKind;
  description?: string;
  defaultSettings?: Record<string, unknown>;
}

export function useStudioProjects(options: UseStudioProjectsOptions = {}) {
  const { currentBrandId } = useCurrentBrand();

  const params = new URLSearchParams();
  if (currentBrandId) params.set('brandId', currentBrandId);
  if (options.kind) params.set('kind', options.kind);
  params.set('status', options.status ?? 'active');

  const url = `/api/v2/ai-studio/projects?${params.toString()}`;
  const { data, error, isLoading, mutate } = useSWR<{ projects: StudioProject[] }>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 2000 },
  );

  const createProject = useCallback(
    async (input: CreateProjectInput): Promise<StudioProject> => {
      const res = await fetch('/api/v2/ai-studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, brandId: currentBrandId ?? undefined }),
      });
      if (!res.ok) throw new Error('Failed to create project');
      const json = (await res.json()) as { project: StudioProject };
      await mutate();
      return json.project;
    },
    [currentBrandId, mutate],
  );

  const renameProject = useCallback(
    async (id: string, name: string): Promise<StudioProject> => {
      const res = await fetch(`/api/v2/ai-studio/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to rename project');
      const json = (await res.json()) as { project: StudioProject };
      await mutate();
      return json.project;
    },
    [mutate],
  );

  const archiveProject = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`/api/v2/ai-studio/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to archive project');
      await mutate();
    },
    [mutate],
  );

  const projects = useMemo(() => data?.projects ?? [], [data]);

  return {
    projects,
    isLoading,
    error,
    createProject,
    renameProject,
    archiveProject,
    refresh: mutate,
  };
}
