'use client';

/**
 * Attach-a-character control for the generation modes' right-hand params.
 * Selecting a character sets `characterId` on the run, which the orchestration
 * layer feeds to `applyCharacter()` (style/voice/reference/negative-prompt).
 *
 * Composed from the ui-kit (Field / Select).
 */

import React from 'react';
import { Field, Select, type SelectOption } from '@/components/ui-kit';
import { useCharacters } from '@/hooks/ai-studio/use-characters';

interface CharacterPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}

const NONE = 'none';

export function CharacterPicker({ value, onChange, disabled }: CharacterPickerProps) {
  const { characters } = useCharacters();

  const options: SelectOption[] = [
    { value: NONE, label: 'No character' },
    ...characters.map((c) => ({ value: c._id, label: c.name })),
  ];

  return (
    <Field
      label="Character"
      hint={
        characters.length === 0
          ? 'Create a character in the Character tab to attach it here.'
          : undefined
      }
    >
      <Select
        value={value ?? NONE}
        onChange={(v) => onChange(v === NONE ? null : v)}
        disabled={disabled}
        triggerClassName="h-9"
        placeholder="Attach a character"
        options={options}
      />
    </Field>
  );
}
