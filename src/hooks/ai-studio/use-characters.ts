'use client';

/**
 * Reusable characters — brand-scoped list + create/update/archive.
 *
 * Lists the active brand's characters plus org-shared ones (brandId unset).
 * Create stamps the active brand by default. These feed both the Character
 * builder and the "attach character" pickers in the other modes.
 */

import useSWR from 'swr';
import { useCallback } from 'react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import type {
  StudioCharacter,
  StudioCharacterAvatar,
  StudioCharacterRefImage,
  StudioCharacterVoice,
} from './types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export interface CharacterInput {
  name: string;
  description?: string;
  styleDescriptors?: string[];
  personality?: string;
  referenceImages?: StudioCharacterRefImage[];
  voice?: StudioCharacterVoice;
  avatar?: StudioCharacterAvatar;
  negativePrompt?: string;
  loraModelId?: string;
}

export function useCharacters() {
  const { currentBrandId } = useCurrentBrand();

  const params = new URLSearchParams();
  if (currentBrandId) params.set('brandId', currentBrandId);
  const url = `/api/v2/ai-studio/characters?${params.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<{ characters: StudioCharacter[] }>(
    url,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 2000 },
  );

  const createCharacter = useCallback(
    async (input: CharacterInput): Promise<StudioCharacter> => {
      const res = await fetch('/api/v2/ai-studio/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, brandId: currentBrandId ?? undefined }),
      });
      if (!res.ok) throw new Error('Failed to create character');
      const json = (await res.json()) as { character: StudioCharacter };
      await mutate();
      return json.character;
    },
    [currentBrandId, mutate],
  );

  const updateCharacter = useCallback(
    async (id: string, patch: Partial<CharacterInput>): Promise<StudioCharacter> => {
      const res = await fetch(`/api/v2/ai-studio/characters/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Failed to update character');
      const json = (await res.json()) as { character: StudioCharacter };
      await mutate();
      return json.character;
    },
    [mutate],
  );

  const archiveCharacter = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`/api/v2/ai-studio/characters/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to archive character');
      await mutate();
    },
    [mutate],
  );

  return {
    characters: data?.characters ?? [],
    isLoading,
    error,
    createCharacter,
    updateCharacter,
    archiveCharacter,
    refresh: mutate,
  };
}
