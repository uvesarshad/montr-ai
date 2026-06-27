/**
 * Runway (Gen-3 Alpha / Gen-3 Turbo) video provider.
 *
 * Long-running job pattern:
 *   1. POST `/v1/image_to_video` (or `/v1/text_to_video`) → returns `{ id }`
 *   2. GET `/v1/tasks/{id}` until `status === 'SUCCEEDED'` → `output: [url]`
 *
 * Generation is text-only (Gen-3) or image+text (Gen-3 Alpha Turbo). We
 * return a `GenerateVideoJob` with `status: 'processing'` immediately; the
 * AI Studio orchestration / BullMQ worker polls for completion via
 * `pollRunwayJob()` and then calls `completeSession()`.
 *
 * Auth: Bearer with `X-Runway-Version: 2024-11-06`.
 *
 * Plan-tier gating is enforced upstream by the router.
 */

import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  GenerateVideoRequest,
  GenerateVideoJob,
  ResolvedRoute,
} from './types';

const RUNWAY_BASE = process.env.RUNWAY_BASE_URL || 'https://api.dev.runwayml.com';
const RUNWAY_API_VERSION = '2024-11-06';

interface RunwayTask {
  id: string;
  status: 'PENDING' | 'THROTTLED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  output?: string[];
  failure?: string;
}

async function runwayFetch<T>(
  route: ResolvedRoute,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${RUNWAY_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${route.apiKey}`,
      'X-Runway-Version': RUNWAY_API_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Runway API error (${response.status}): ${body}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Poll a Runway job. Called from the orchestration layer worker / scheduler
 * until the job reaches a terminal state.
 */
export async function pollRunwayJob(route: ResolvedRoute, jobId: string): Promise<GenerateVideoJob> {
  const task = await runwayFetch<RunwayTask>(route, `/v1/tasks/${jobId}`);
  if (task.status === 'SUCCEEDED' && task.output && task.output.length > 0) {
    return { jobId, status: 'completed', videoUrl: task.output[0] };
  }
  if (task.status === 'FAILED' || task.status === 'CANCELLED') {
    return { jobId, status: 'failed', error: task.failure ?? task.status };
  }
  return { jobId, status: 'processing' };
}

export const runwayProvider: ProviderClient = {
  id: 'runway',
  sdk: 'native',
  capabilities: {
    text: false,
    image: false,
    video: true,
    audio: false,
    streaming: false,
    toolCalling: false,
    vision: false,
    promptCaching: false,
  },

  async generateText(_req: GenerateTextRequest): Promise<GenerateTextResult> {
    throw new Error('Runway does not generate text.');
  },
  async streamText(_req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
    throw new Error('Runway does not generate text.');
  },

  async generateVideo(req: GenerateVideoRequest): Promise<GenerateVideoJob> {
    const { route, prompt, referenceImage, durationSeconds, aspectRatio } = req;
    const model = route.resolvedModelId.includes('gen3') || route.resolvedModelId.includes('gen-3')
      ? route.resolvedModelId
      : 'gen3a_turbo';

    const body: Record<string, unknown> = {
      model,
      promptText: prompt,
      duration: durationSeconds ?? 5,
      ratio: runwayAspectRatio(aspectRatio),
    };
    if (referenceImage) {
      body.promptImage = referenceImage;
    }

    const endpoint = referenceImage ? '/v1/image_to_video' : '/v1/text_to_video';
    const task = await runwayFetch<{ id: string }>(route, endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return { jobId: task.id, status: 'processing' };
  },
};

/**
 * Runway supports a fixed set of aspect ratios — map our shorthand to theirs.
 */
function runwayAspectRatio(aspect?: string): string {
  switch (aspect) {
    case '9:16': return '768:1280';
    case '16:9': return '1280:768';
    case '1:1':  return '960:960';
    case '4:3':  return '1104:832';
    case '3:4':  return '832:1104';
    default:     return '1280:768';
  }
}
