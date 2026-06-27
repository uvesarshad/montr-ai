'use server';
/**
 * @fileOverview A flow to generate a video from a text prompt using Veo.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { MediaPart } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
// Lazy auth import — module-scope next-auth breaks the tsx worker process
// (@auth/mongodb-adapter has no CJS-resolvable export). auth() is only used
// inside functions, so it is imported on demand.
import { userRepository } from '@/lib/db/repository/user.repository';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';

const ApiKeysSchema = z.object({
  openai: z.string().optional(),
  deepseek: z.string().optional(),
  googleai: z.string().optional(),
  google: z.string().optional(),
}).optional();

const StartVideoGenerationInputSchema = z.object({
  prompt: z.string(),
  aspectRatio: z.string(),
  durationSeconds: z.number(),
  model: z.string().optional().describe('The video model to use.'),
  style: z.string().optional().describe('Video style preset (natural, cinematic, dynamic, dramatic).'),
  referenceImage: z.string().optional().describe('Optional first-frame reference image (URL or data URL) for image-to-video.'),
  userApiKeys: ApiKeysSchema.optional(),
});
export type StartVideoGenerationInput = z.infer<typeof StartVideoGenerationInputSchema>;

const StartVideoGenerationOutputSchema = z.object({
  operation: z.any().describe('The operation object for polling'),
  creditsUsed: z.number().optional().describe('Credits consumed for this request.'),
});
export type StartVideoGenerationOutput = z.infer<typeof StartVideoGenerationOutputSchema>;

const CheckOperationInputSchema = z.object({
  operation: z.any(),
  userApiKeys: ApiKeysSchema,
});
export type CheckOperationInput = z.infer<typeof CheckOperationInputSchema>;

const CheckOperationOutputSchema = z.object({
  done: z.boolean(),
  videoUrl: z.string().optional(),
  error: z.string().optional(),
  operation: z.any().optional(),
});
export type CheckOperationOutput = z.infer<typeof CheckOperationOutputSchema>;

// Start video generation and return operation name immediately
export async function startVideoGeneration(input: StartVideoGenerationInput): Promise<StartVideoGenerationOutput> {
  const { prompt } = input;

  const session = await (await import('@/lib/get-session')).getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const user = await userRepository.findById(session.user.id);
  if (!user) throw new Error("User not found");

  const userApiKeys = user.userApiKeys;
  const modelIdentifier = input.model || 'veo-3.1';

  // Check credits before processing (video models are expensive)
  const creditCheck = await checkAICredits(session.user.id, modelIdentifier);
  if (!creditCheck.allowed) {
    throw new Error(
      creditCheck.reason === 'insufficient_credits'
        ? `Insufficient credits. You need ${creditCheck.cost} credits but have ${creditCheck.remaining}. Video generation requires more credits.`
        : 'No active subscription. Please subscribe to use AI features.'
    );
  }

  console.log('🎥 Starting video generation with prompt:', prompt);
  console.log('📊 Credit cost:', creditCheck.cost);

  const config: { aspectRatio?: string; durationSeconds?: number } = {};
  const generationOptions: { plugins?: unknown[] } = {};

  // Determine if using BYOK
  const usingByok = !!(input.userApiKeys?.googleai || input.userApiKeys?.google || userApiKeys?.googleai || userApiKeys?.google);

  if (input.userApiKeys?.googleai || input.userApiKeys?.google) {
    console.log('Video Generation: Using user-provided Google AI key.');
    generationOptions.plugins = [googleAI({ apiKey: input.userApiKeys.googleai || input.userApiKeys.google })];
  } else if (userApiKeys?.googleai || userApiKeys?.google) { // Use server fetched key
    console.log('Video Generation: Using server-fetched Google AI key.');
    generationOptions.plugins = [googleAI({ apiKey: userApiKeys.googleai || userApiKeys.google })];
  }

  // Consume credits before starting (video generation is async)
  await consumeAICredits(session.user.id, modelIdentifier, 'video', usingByok);

  // Ensure the model name is correct for the Google AI plugin
  // If modelIdentifier is just 'veo-3.1', we likely need to map it or use it with 'googleai/' prefix if that's how it's registered
  // Assuming 'googleai/' prefix is needed for the Genkit plugin
  const actualModelName = modelIdentifier.includes('/') ? modelIdentifier : `googleai/${modelIdentifier}`;

  // Image-to-video when a first-frame reference is supplied; otherwise text-only
  // (existing behavior, unchanged).
  const promptArg = input.referenceImage
    ? [{ media: { url: input.referenceImage } }, { text: input.prompt }]
    : input.prompt;

  const { operation } = await ai.generate({
    model: actualModelName,
    prompt: promptArg,
    config,
    ...generationOptions
  });

  if (!operation) {
    throw new Error('Expected the model to return an operation');
  }

  return { operation, creditsUsed: creditCheck.cost };
}

// Check operation status
export async function checkVideoOperation(input: CheckOperationInput): Promise<CheckOperationOutput> {
  let operation = input.operation;

  const generationOptions: { plugins?: unknown[] } = {};
  const userApiKey: string | undefined = input.userApiKeys?.googleai || input.userApiKeys?.google;

  if (userApiKey) {
    console.log('Video Check Operation: Using user-provided Google AI key.');
    generationOptions.plugins = [googleAI({ apiKey: userApiKey })];
  }

  // Poll for completion
  operation = await ai.checkOperation(operation); // generationOptions removed if not supported

  if (!operation.done) {
    return { done: false, operation };
  }

  if (operation.error) {
    return {
      done: true,
      error: operation.error.message || JSON.stringify(operation.error),
      operation,
    };
  }

  const video = operation.output?.message?.content.find((p: { media?: unknown }) => !!p.media);

  if (!video || !video.media) {
    return { done: true, error: 'Failed to find the generated video in the operation result.', operation };
  }

  try {
    const videoBase64 = await downloadVideo(video, userApiKey);
    return {
      done: true,
      videoUrl: `data:video/mp4;base64,${videoBase64}`,
      operation,
    };
  } catch (downloadError) {
    const message = downloadError instanceof Error ? downloadError.message : String(downloadError);
    return { done: true, error: `Video download failed: ${message}`, operation };
  }
}

async function downloadVideo(video: MediaPart, userApiKey?: string): Promise<string> {
  const fetch = (await import('node-fetch')).default;
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('Google AI API key is not provided.');
  }

  if (!video.media?.url) {
    throw new Error('Video media URL is missing.');
  }

  const videoDownloadResponse = await fetch(`${video.media.url}&key=${apiKey}`);

  if (!videoDownloadResponse.ok) {
    const errorText = await videoDownloadResponse.text();
    throw new Error(`Failed to fetch video: ${videoDownloadResponse.status} ${errorText}`);
  }

  const buffer = await videoDownloadResponse.buffer();
  return buffer.toString('base64');
}
