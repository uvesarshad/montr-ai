'use server';
/**
 * @fileOverview Talking-avatar render flow (AI Studio revamp M2).
 *
 * Provider-agnostic: routes through `resolveRoute` → `provider.generateAvatarVideo`
 * (D-ID, HeyGen, …). Long-running, so the browser polls `checkAvatarOperation`
 * (mirrors the video flow), then persists the finished take via /sessions/record.
 * Keys are resolved by the router (BYOK → system env set in the super-admin panel).
 */

import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { resolveRoute } from '@/ai/router';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';

export interface StartAvatarInput {
  model: string;
  script: string;
  /** Photo-driven providers (D-ID): the character's source portrait. */
  sourceImageUrl?: string;
  /** Preset providers (HeyGen): catalog avatar id. */
  providerAvatarId?: string;
  voiceId?: string;
  language?: string;
  aspectRatio?: string;
}

export interface StartAvatarOutput {
  jobId: string;
  /** Echoed back so the client can re-resolve the route when polling. */
  model: string;
}

export async function startAvatarGeneration(input: StartAvatarInput): Promise<StartAvatarOutput> {
  const session = await getSession();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const user = await userRepository.findById(session.user.id);
  if (!user) throw new Error('User not found');

  const model = input.model || 'd-id-talk';

  const creditCheck = await checkAICredits(session.user.id, model);
  if (!creditCheck.allowed) {
    throw new Error(
      creditCheck.reason === 'insufficient_credits'
        ? `Insufficient credits. You need ${creditCheck.cost} but have ${creditCheck.remaining}.`
        : 'No active subscription. Please subscribe to use AI features.',
    );
  }

  const { provider, route } = resolveRoute({ model, userApiKeys: user.userApiKeys });
  if (!provider.generateAvatarVideo) {
    throw new Error(`Provider '${provider.id}' does not support talking-avatar render.`);
  }

  const usingByok = route.keySource === 'user';
  await consumeAICredits(session.user.id, model, 'video', usingByok);

  const job = await provider.generateAvatarVideo({
    route,
    script: input.script,
    sourceImageUrl: input.sourceImageUrl,
    providerAvatarId: input.providerAvatarId,
    voiceId: input.voiceId,
    language: input.language,
    aspectRatio: input.aspectRatio,
  });

  if (job.status === 'failed') {
    throw new Error(job.error || 'Avatar render failed to start.');
  }
  return { jobId: job.jobId, model };
}

export interface CheckAvatarInput {
  model: string;
  jobId: string;
}

export interface CheckAvatarOutput {
  done: boolean;
  videoUrl?: string;
  error?: string;
}

export async function checkAvatarOperation(input: CheckAvatarInput): Promise<CheckAvatarOutput> {
  const session = await getSession();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const user = await userRepository.findById(session.user.id);
  if (!user) throw new Error('User not found');

  const { provider, route } = resolveRoute({ model: input.model, userApiKeys: user.userApiKeys });
  if (!provider.pollAvatarVideo) {
    throw new Error(`Provider '${provider.id}' cannot poll a talking-avatar render.`);
  }

  const job = await provider.pollAvatarVideo(route, input.jobId);
  if (job.status === 'completed') return { done: true, videoUrl: job.videoUrl };
  if (job.status === 'failed') return { done: true, error: job.error };
  return { done: false };
}
