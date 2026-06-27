
'use server';
/**
 * @fileOverview A flow to generate an image from a text prompt and/or a source image.
 *
 * - generateImage - A function that generates an image.
 * - GenerateImageInput - The input type for the generateImage function.
 * - GenerateImageOutput - The return type for the generateImage function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { MediaPart } from 'genkit';
import { openAI } from 'genkitx-openai';
import { ApiKeysSchema } from '@/ai/types';
// Lazy auth import — module-scope next-auth breaks the tsx worker process
// (@auth/mongodb-adapter has no CJS-resolvable export). auth() is only used
// inside functions, so it is imported on demand.
import { userRepository } from '@/lib/db/repository/user.repository';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText as generateAI } from 'ai';
import { findModelById } from '@/lib/model-groups';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';


const GenerateImageInputSchema = z.object({
  prompt: z.string().describe('The text description of the desired image or modifications.'),
  model: z.string().optional().describe('The model to use for generation.'),
  imageDataUri: z.string().nullable().optional().describe("An optional source image as a data URI. Required for image-to-image models."),
  aspectRatio: z.string().optional().describe('The desired aspect ratio for the generated image (e.g., "1:1", "16:9").'),
  guidanceScale: z.number().min(1).max(20).optional().describe('How closely to follow the prompt (1-20).'),
  seed: z.number().int().min(0).max(4294967295).optional().describe('Random seed for reproducible results.'),
  negativePrompt: z.string().optional().describe('Things to avoid in the generated image.'),
  userApiKeys: ApiKeysSchema.optional(),
});
export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

const GenerateImageOutputSchema = z.object({
  imageUrl: z.string().describe('The data URI of the generated image.'),
  creditsUsed: z.number().optional().describe('Credits consumed for this request.'),
  modelUsed: z.string().optional().describe('The actual model identifier used.'),
});
export type GenerateImageOutput = z.infer<typeof GenerateImageOutputSchema>;

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const { prompt, model, imageDataUri, aspectRatio, guidanceScale, seed, negativePrompt } = input;

  const session = await (await import('@/lib/get-session')).getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const user = await userRepository.findById(session.user.id);
  if (!user) throw new Error("User not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userApiKeys = (user as any).userApiKeys;

  // Resolve model identifier with prefix if needed
  let modelIdentifier = model || 'googleai/imagen-4.0-fast-generate-001';

  // Check if we need to add provider prefix for known models
  if (model && !model.includes('/')) {
    const modelDef = findModelById(model);
    if (modelDef?.provider === 'google') {
      modelIdentifier = `googleai/${model}`;
    }
  }

  // Check credits before processing
  const creditCheck = await checkAICredits(session.user.id, modelIdentifier);
  if (!creditCheck.allowed) {
    throw new Error(
      creditCheck.reason === 'insufficient_credits'
        ? `Insufficient credits. You need ${creditCheck.cost} credits but have ${creditCheck.remaining}.`
        : 'No active subscription. Please subscribe to use AI features.'
    );
  }

  console.log('🖼️ Generating image with prompt:', prompt);
  console.log('🎨 Using model:', modelIdentifier);

  // Determine if using BYOK
  const usingByok = !!(userApiKeys?.googleai || userApiKeys?.openai || userApiKeys?.openrouter);

  // Logic for providers that have their own image models not covered by OpenRouter
  if (modelIdentifier.startsWith('googleai/')) {
    let generationPrompt: (string | MediaPart)[] | string = prompt;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generationOptions: any = {};

    if (userApiKeys?.googleai) {
      console.log('Image Generation: Using user-provided Google AI key.');
      generationOptions.plugins = [openAI({ apiKey: userApiKeys.googleai })];
    }

    if (aspectRatio) {
      config.aspectRatio = aspectRatio;
    }
    if (guidanceScale !== undefined) {
      config.guidanceScale = guidanceScale;
    }
    if (seed !== undefined) {
      config.seed = seed;
    }
    if (negativePrompt) {
      config.negativePrompt = negativePrompt;
    }

    // Handle image-to-image models
    if (imageDataUri) {
      const imageUris = imageDataUri.split('|||');
      const mediaParts: MediaPart[] = imageUris.map(uri => ({ media: { url: uri } }));

      generationPrompt = [
        ...mediaParts,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { text: prompt } as any,
      ];
      if (modelIdentifier.includes('gemini')) {
        config.responseModalities = ['TEXT', 'IMAGE'];
      }
    }

    const { media } = await ai.generate({
      model: modelIdentifier,
      prompt: generationPrompt,
      config: Object.keys(config).length > 0 ? config : undefined,
      ...generationOptions
    });

    console.log('📦 Full AI response:', JSON.stringify({ media }, null, 2));

    const imageUrl = media?.url;
    if (!imageUrl) {
      console.error('❌ Image generation failed: No media URL found in the response.');
      throw new Error('Image generation failed to produce an output.');
    }

    console.log('✅ Generated imageUrl (first 100 chars):', imageUrl.substring(0, 100));

    // Consume credits after successful generation
    await consumeAICredits(session.user.id, modelIdentifier, 'image', usingByok);

    return { imageUrl, creditsUsed: creditCheck.cost };

  } else {
    // Use AI SDK for OpenAI-compatible APIs (like OpenRouter or OpenAI itself)
    const apiKey = userApiKeys?.openrouter || userApiKeys?.openai || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    const isDirectOpenAI = modelIdentifier.startsWith('openai/') && (userApiKeys?.openai || process.env.OPENAI_API_KEY);

    const baseURL = isDirectOpenAI ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1';

    if (!apiKey) {
      throw new Error('An API key for OpenRouter or OpenAI is required for this model.');
    }

    const client = createOpenAI({
      baseURL,
      apiKey,
      headers: isDirectOpenAI ? {} : {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Montr AI',
      },
    });

    const { text: imageUrl } = await generateAI({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: client(modelIdentifier) as any,
      prompt: prompt,
    });

    if (!imageUrl) {
      throw new Error('Image generation with AI SDK failed.');
    }

    // Consume credits after successful generation
    await consumeAICredits(session.user.id, modelIdentifier, 'image', usingByok);

    // The SDK returns different formats. We want a data URI.
    if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      // If it's a URL, fetch and convert to data URI
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onloadend = () => resolve({ imageUrl: reader.result as string, creditsUsed: creditCheck.cost });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      return { imageUrl: imageUrl as string, creditsUsed: creditCheck.cost };
    }
  }
}
