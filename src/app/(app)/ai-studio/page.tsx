import { StudioWorkspace } from '@/components/ai-studio/studio/studio-workspace';
import { STUDIO_MODE_ORDER, type StudioMode } from '@/components/ai-studio/studio/studio-meta';

/**
 * AI Studio — unified, type-first creation workspace (revamp M1).
 *
 * Replaces the old 5-card overview AND the five route-pages, which now redirect
 * here with `?mode=`. Image/Video/Text are native; Audio/Character show "soon".
 * See the approved design doc + memory `ai-studio-revamp-direction`.
 */
export default async function AIStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; c?: string }>;
}) {
  const { mode, c } = await searchParams;
  const initialMode =
    mode && (STUDIO_MODE_ORDER as string[]).includes(mode) ? (mode as StudioMode) : undefined;
  const initialConversationId = typeof c === 'string' && c ? c : undefined;

  return <StudioWorkspace initialMode={initialMode} initialConversationId={initialConversationId} />;
}
