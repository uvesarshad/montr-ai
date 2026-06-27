/**
 * Replicate image provider — Flux, Stable Diffusion variants, and arbitrary
 * fine-tunes. Uses Replicate's prediction API: POST `predictions` returns
 * an id, GET `predictions/{id}` polls until completion.
 *
 * Replicate's catalog is huge — the `resolvedModelId` field carries the full
 * `owner/model[:version]` slug (e.g. `black-forest-labs/flux-schnell`).
 */

import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  GenerateImageRequest,
  GenerateImageResult,
  ResolvedRoute,
} from './types';

const REPLICATE_BASE = 'https://api.replicate.com/v1';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

async function replicateFetch<T>(
  route: ResolvedRoute,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${REPLICATE_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Token ${route.apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Replicate API error (${response.status}): ${body}`);
  }
  return response.json() as Promise<T>;
}

async function pollPrediction(route: ResolvedRoute, id: string, maxWaitMs = 60_000): Promise<ReplicatePrediction> {
  const start = Date.now();
  let prediction = await replicateFetch<ReplicatePrediction>(route, `/predictions/${id}`);
  while (
    (prediction.status === 'starting' || prediction.status === 'processing') &&
    Date.now() - start < maxWaitMs
  ) {
    await new Promise(r => setTimeout(r, 1500));
    prediction = await replicateFetch<ReplicatePrediction>(route, `/predictions/${id}`);
  }
  return prediction;
}

export const replicateProvider: ProviderClient = {
  id: 'replicate',
  sdk: 'native',
  capabilities: {
    text: false,
    image: true,
    video: false,
    audio: false,
    streaming: false,
    toolCalling: false,
    vision: false,
    promptCaching: false,
  },

  async generateText(_req: GenerateTextRequest): Promise<GenerateTextResult> {
    throw new Error('Replicate provider exposes image generation only.');
  },
  async streamText(_req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
    throw new Error('Replicate provider exposes image generation only.');
  },

  async generateImage(req: GenerateImageRequest): Promise<GenerateImageResult> {
    const { route, prompt, aspectRatio, count, negativePrompt, referenceImage } = req;

    // The resolvedModelId may include a `:version` suffix (`owner/model:version`).
    // When it does, send `version`; otherwise send `model` (Replicate accepts both).
    const [modelOrSlug, version] = route.resolvedModelId.split(':');
    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: aspectRatio ?? '1:1',
      num_outputs: count ?? 1,
    };
    if (negativePrompt) input.negative_prompt = negativePrompt;
    if (referenceImage) input.image = referenceImage;

    const body: Record<string, unknown> = { input };
    if (version) body.version = version;
    else body.model = modelOrSlug;

    const created = await replicateFetch<ReplicatePrediction>(route, '/predictions', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const final = await pollPrediction(route, created.id);
    if (final.status !== 'succeeded') {
      throw new Error(`Replicate prediction ${created.id} ${final.status}: ${final.error ?? 'unknown'}`);
    }

    const output = final.output;
    const images = Array.isArray(output) ? output : output ? [output] : [];
    return { images };
  },
};
