/**
 * Ideogram image provider — strong at text-in-image and typography.
 * API: `https://api.ideogram.ai/generate` returns image URLs synchronously
 * (no polling). Auth: `Api-Key` header.
 */

import {
  ProviderClient,
  GenerateTextRequest,
  GenerateTextResult,
  GenerateImageRequest,
  GenerateImageResult,
} from './types';

const IDEOGRAM_BASE = process.env.IDEOGRAM_BASE_URL || 'https://api.ideogram.ai';

interface IdeogramResponse {
  data?: Array<{ url?: string; prompt?: string; resolution?: string }>;
}

export const ideogramProvider: ProviderClient = {
  id: 'ideogram',
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
    throw new Error('Ideogram provider exposes image generation only.');
  },
  async streamText(_req: GenerateTextRequest): Promise<AsyncGenerator<string>> {
    throw new Error('Ideogram provider exposes image generation only.');
  },

  async generateImage(req: GenerateImageRequest): Promise<GenerateImageResult> {
    const { route, prompt, aspectRatio, negativePrompt } = req;
    const body = {
      image_request: {
        prompt,
        model: route.resolvedModelId.replace(/^ideogram\//, '') || 'V_2',
        aspect_ratio: ideogramAspect(aspectRatio),
        magic_prompt_option: 'AUTO',
        negative_prompt: negativePrompt,
      },
    };

    const response = await fetch(`${IDEOGRAM_BASE}/generate`, {
      method: 'POST',
      headers: {
        'Api-Key': route.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ideogram API error (${response.status}): ${text}`);
    }
    const json = await response.json() as IdeogramResponse;
    const images = (json.data ?? []).map(d => d.url).filter((u): u is string => !!u);
    return { images };
  },
};

function ideogramAspect(aspect?: string): string {
  switch (aspect) {
    case '1:1': return 'ASPECT_1_1';
    case '16:9': return 'ASPECT_16_9';
    case '9:16': return 'ASPECT_9_16';
    case '4:3': return 'ASPECT_4_3';
    case '3:4': return 'ASPECT_3_4';
    default: return 'ASPECT_1_1';
  }
}
