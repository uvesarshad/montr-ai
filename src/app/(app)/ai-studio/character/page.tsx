import { redirect } from 'next/navigation';

/** Retired: Character now lives in the unified workspace (M2 talking-avatar builder). */
export default function CharacterRedirect() {
  redirect('/ai-studio?mode=character');
}
