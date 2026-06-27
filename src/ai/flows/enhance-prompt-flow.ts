'use server';

/**
 * Prompt enhancer for the AI Studio composer.
 *
 * Rewrites a user's rough prompt into a stronger generation prompt, tailored to
 * the media type. The model is resolved from the `promptEnhancer` AI task via
 * AISettingsService (default `gemini-2.5-flash-lite`), so it's manageable in the
 * AI preferences settings (user override → system default → fallback).
 */

import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { generateTextWithClient } from '@/ai/client';
import { checkAICredits } from '@/ai/credit-wrapper';
import { AISettingsService } from '@/lib/services/ai-settings.service';

export type EnhanceMediaType = 'image' | 'video' | 'audio' | 'text' | 'character';

export interface EnhancePromptInput {
  prompt: string;
  mediaType?: EnhanceMediaType;
}

export interface EnhancePromptOutput {
  enhancedPrompt: string;
}

const GUIDANCE: Record<EnhanceMediaType, string> = {
  image:
    'a text-to-image generation prompt. Expand it into ONE vivid, descriptive prompt covering subject, composition, lighting, style, lens, and mood.',
  video:
    'a text-to-video generation prompt. Expand it into ONE cinematic prompt covering subject, camera movement, pacing, lighting, and mood.',
  audio:
    'a text-to-speech script. Refine it into clear, natural spoken lines that read well aloud. No stage directions.',
  text: 'a writing instruction. Make it clearer and more specific while preserving the original intent.',
  character:
    'a character/persona description. Make it vivid and consistent across look, personality, and voice.',
};

export async function enhancePrompt(input: EnhancePromptInput): Promise<EnhancePromptOutput> {
  const session = await getSession();
  if (!session?.user?.id) throw new Error('Unauthorized');
  if (!input.prompt.trim()) return { enhancedPrompt: input.prompt };

  const pref = await AISettingsService.getPreferredModel(session.user.id, 'promptEnhancer');

  const creditCheck = await checkAICredits(session.user.id, pref.modelId);
  if (!creditCheck.allowed) {
    throw new Error(
      creditCheck.reason === 'insufficient_credits'
        ? `Insufficient credits. You need ${creditCheck.cost} but have ${creditCheck.remaining}.`
        : 'No active subscription. Please subscribe to use AI features.',
    );
  }

  const user = await userRepository.findById(session.user.id);
  const guide = GUIDANCE[input.mediaType ?? 'image'] ?? GUIDANCE.image;
  const system = `You are an expert prompt engineer. Rewrite the user's input as ${guide}\nReturn ONLY the improved prompt text — no preamble, no quotes, no lists, no explanation.`;

  const response = await generateTextWithClient({
    model: pref.modelId,
    system,
    messages: [{ role: 'user', content: input.prompt }],
    userApiKeys: user?.userApiKeys,
    routeHint: pref.routeHint ?? null,
  });

  const enhanced = (response ?? '').trim();
  return { enhancedPrompt: enhanced || input.prompt };
}
