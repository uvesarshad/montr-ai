/**
 * D-ID talking-avatar provider (photo-driven).
 *
 * Long-running job pattern (mirrors the video providers):
 *   1. POST `/talks` with { source_url, script } → { id }
 *   2. GET `/talks/{id}` until `status === 'done'` → `result_url`
 *
 * Photo-driven: animates `sourceImageUrl` speaking `script`. Provider-agnostic
 * fit for the M2 "photo-driven default" choice. Auth is HTTP Basic with the
 * D-ID API key.
 *
 * NOTE: request/response shapes follow D-ID's public API docs; verify against a
 * live key (set DID_API_KEY in the super-admin panel) before relying on it.
 */

import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  GenerateAvatarVideoRequest,
  GenerateVideoJob,
  ResolvedRoute,
} from './types';

const DID_BASE = process.env.DID_BASE_URL || 'https://api.d-id.com';

interface DidTalk {
  id: string;
  status: 'created' | 'started' | 'done' | 'error' | 'rejected';
  result_url?: string;
  error?: { description?: string } | string;
}

async function didFetch<T>(route: ResolvedRoute, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${DID_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${route.apiKey}`,
      'Content-Type': 'application/json',
      accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`D-ID API error (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export const didProvider: ProviderClient = {
  id: 'did',
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
    throw new Error('D-ID does not generate text.');
  },
  async streamText(_req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
    throw new Error('D-ID does not generate text.');
  },

  async generateAvatarVideo(req: GenerateAvatarVideoRequest): Promise<GenerateVideoJob> {
    const { route, script, sourceImageUrl, voiceId } = req;
    if (!sourceImageUrl) {
      throw new Error('D-ID is photo-driven — a character source image (avatar.sourceImageUrl) is required.');
    }
    const body: Record<string, unknown> = {
      source_url: sourceImageUrl,
      script: {
        type: 'text',
        input: script,
        ...(voiceId
          ? { provider: { type: 'microsoft', voice_id: voiceId } }
          : {}),
      },
    };
    const talk = await didFetch<{ id: string }>(route, '/talks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { jobId: talk.id, status: 'processing' };
  },

  async pollAvatarVideo(route: ResolvedRoute, jobId: string): Promise<GenerateVideoJob> {
    const talk = await didFetch<DidTalk>(route, `/talks/${jobId}`);
    if (talk.status === 'done' && talk.result_url) {
      return { jobId, status: 'completed', videoUrl: talk.result_url };
    }
    if (talk.status === 'error' || talk.status === 'rejected') {
      const err = typeof talk.error === 'string' ? talk.error : talk.error?.description;
      return { jobId, status: 'failed', error: err ?? talk.status };
    }
    return { jobId, status: 'processing' };
  },
};
