'use client';

/**
 * Run a generation through the orchestration layer (POST /sessions/run).
 *
 * Always attaches the active `brandId` from `useCurrentBrand()` so the project
 * is brand-scoped and outputs auto-import into the media library. Returns the
 * created/updated session; for long-running kinds (video) the session may come
 * back `running` and is finished later by the worker/poller.
 */

import { useCallback, useState } from 'react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import type { StudioKind, StudioSession } from './types';

export interface RunStudioInput {
  /** Omit to create a fresh transient project for this run. */
  projectId?: string;
  /** Name used only when a transient project is created. */
  projectName?: string;
  kind: StudioKind;
  model: string;
  prompt: string;
  systemPrompt?: string;
  settings?: Record<string, unknown>;
  characterId?: string;
}

export interface RunStudioResult {
  projectId: string;
  session: StudioSession;
}

export function useStudioRun() {
  const { currentBrandId } = useCurrentBrand();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (input: RunStudioInput): Promise<RunStudioResult> => {
      setIsRunning(true);
      setError(null);
      try {
        const res = await fetch('/api/v2/ai-studio/sessions/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, brandId: currentBrandId ?? undefined }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || 'Generation failed');
        }
        return json as RunStudioResult;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Generation failed';
        setError(message);
        throw e;
      } finally {
        setIsRunning(false);
      }
    },
    [currentBrandId],
  );

  return { run, isRunning, error };
}
