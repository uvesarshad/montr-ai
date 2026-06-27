/**
 * HeyGen talking-avatar provider (preset catalog avatars).
 *
 * Long-running job pattern:
 *   1. POST `/v2/video/generate` → { data: { video_id } }
 *   2. GET  `/v1/video_status.get?video_id=` until status `completed` → video_url
 *
 * Preset-oriented: needs a catalog avatar id (avatar.providerAvatarId). For a
 * pasted/uploaded photo HeyGen requires a pre-registered talking_photo_id, so
 * pure photo-driven URLs aren't supported here — use D-ID for that. Auth header
 * is `X-Api-Key`.
 *
 * NOTE: request/response shapes follow HeyGen's public API docs; verify against
 * a live key (set HEYGEN_API_KEY in the super-admin panel) before relying on it.
 */

import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  GenerateAvatarVideoRequest,
  GenerateVideoJob,
  ResolvedRoute,
} from './types';

const HEYGEN_BASE = process.env.HEYGEN_BASE_URL || 'https://api.heygen.com';

function dimensionFor(aspect?: string): { width: number; height: number } {
  switch (aspect) {
    case '9:16': return { width: 720, height: 1280 };
    case '1:1': return { width: 1080, height: 1080 };
    case '16:9':
    default: return { width: 1280, height: 720 };
  }
}

async function heygenFetch<T>(route: ResolvedRoute, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    ...init,
    headers: {
      'X-Api-Key': route.apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HeyGen API error (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export const heygenProvider: ProviderClient = {
  id: 'heygen',
  sdk: 'native',
  capabilities: {
    text: false,
    image: false,
    video: false,
    audio: false,
    avatarVideo: true,
    streaming: false,
    toolCalling: false,
    vision: false,
    promptCaching: false,
  },

  async generateText(_req: GenerateTextRequest): Promise<GenerateTextResult> {
    throw new Error('HeyGen does not generate text.');
  },
  async streamText(_req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
    throw new Error('HeyGen does not generate text.');
  },

  async generateAvatarVideo(req: GenerateAvatarVideoRequest): Promise<GenerateVideoJob> {
    const { route, script, providerAvatarId, voiceId, aspectRatio } = req;
    if (!providerAvatarId) {
      throw new Error('HeyGen needs a preset avatar id (avatar.providerAvatarId). Use D-ID for photo-driven characters.');
    }
    const dimension = dimensionFor(aspectRatio);
    const body = {
      video_inputs: [
        {
          character: { type: 'avatar', avatar_id: providerAvatarId },
          voice: { type: 'text', input_text: script, voice_id: voiceId },
        },
      ],
      dimension,
    };
    const res = await heygenFetch<{ data?: { video_id?: string }; error?: unknown }>(
      route,
      '/v2/video/generate',
      { method: 'POST', body: JSON.stringify(body) },
    );
    const videoId = res.data?.video_id;
    if (!videoId) {
      throw new Error(`HeyGen did not return a video_id: ${JSON.stringify(res.error ?? res)}`);
    }
    return { jobId: videoId, status: 'processing' };
  },

  async pollAvatarVideo(route: ResolvedRoute, jobId: string): Promise<GenerateVideoJob> {
    const res = await heygenFetch<{ data?: { status?: string; video_url?: string; error?: unknown } }>(
      route,
      `/v1/video_status.get?video_id=${encodeURIComponent(jobId)}`,
    );
    const status = res.data?.status;
    if (status === 'completed' && res.data?.video_url) {
      return { jobId, status: 'completed', videoUrl: res.data.video_url };
    }
    if (status === 'failed') {
      return { jobId, status: 'failed', error: JSON.stringify(res.data?.error ?? 'failed') };
    }
    return { jobId, status: 'processing' };
  },
};
