'use client';

/**
 * Persist a client-computed generation result (e.g. a polled video render) as a
 * completed session via POST /sessions/record. Attaches the active brandId so
 * the project is brand-scoped and the asset-library bridge fires.
 */

import { useCallback, useState } from 'react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import type { StudioKind, StudioSession } from './types';

export interface RecordStudioInput {
  projectId?: string;
  projectName?: string;
  kind: StudioKind;
  model: string;
  prompt: string;
  settings?: Record<string, unknown>;
  outputUrls?: string[];
  outputText?: string;
  characterId?: string;
}

export interface RecordStudioResult {
  projectId: string;
  session: StudioSession;
}

export function useStudioRecord() {
  const { currentBrandId } = useCurrentBrand();
  const [isRecording, setIsRecording] = useState(false);

  const record = useCallback(
    async (input: RecordStudioInput): Promise<RecordStudioResult> => {
      setIsRecording(true);
      try {
        const res = await fetch('/api/v2/ai-studio/sessions/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, brandId: currentBrandId ?? undefined }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to save result');
        return json as RecordStudioResult;
      } finally {
        setIsRecording(false);
      }
    },
    [currentBrandId],
  );

  return { record, isRecording };
}
