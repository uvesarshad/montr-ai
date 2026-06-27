'use server';

/**
 * Text-to-speech flow for AI Studio Audio mode.
 *
 * Provider-agnostic via `resolveRoute` → `provider.generateAudio` (OpenAI,
 * ElevenLabs, Sarvam — the same TTS providers the voice agents use). Returns a
 * playable audio data URL. Keys resolve through the router (BYOK → system env
 * set in the super-admin panel).
 */

import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { resolveRoute } from '@/ai/router';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';

export interface GenerateSpeechInput {
  model: string;
  text: string;
  voice?: string;
  speed?: number;
  language?: string;
}

export interface GenerateSpeechOutput {
  audioUrl: string;
  mimeType: string;
}

export async function generateSpeech(input: GenerateSpeechInput): Promise<GenerateSpeechOutput> {
  const session = await getSession();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const user = await userRepository.findById(session.user.id);
  if (!user) throw new Error('User not found');
  if (!input.text.trim()) throw new Error('Text is required.');

  const model = input.model || 'openai-tts';

  const creditCheck = await checkAICredits(session.user.id, model);
  if (!creditCheck.allowed) {
    throw new Error(
      creditCheck.reason === 'insufficient_credits'
        ? `Insufficient credits. You need ${creditCheck.cost} but have ${creditCheck.remaining}.`
        : 'No active subscription. Please subscribe to use AI features.',
    );
  }

  const { provider, route } = resolveRoute({ model, userApiKeys: user.userApiKeys });
  if (!provider.generateAudio) {
    throw new Error(`Provider '${provider.id}' does not support text-to-speech.`);
  }

  const usingByok = route.keySource === 'user';
  await consumeAICredits(session.user.id, model, 'audio', usingByok);

  const result = await provider.generateAudio({
    route,
    text: input.text,
    voice: input.voice,
    speed: input.speed,
    language: input.language,
  });

  return { audioUrl: result.audioUrl, mimeType: result.mimeType };
}
