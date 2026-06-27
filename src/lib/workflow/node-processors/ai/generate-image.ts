/**
 * AI Generate Image Processor
 *
 * Uses the existing generateImage flow from /src/ai/flows/generate-image-flow.ts
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { generateImage } from '../../../../ai/flows/generate-image-flow';

export class GenerateImageProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    // Get image generation configuration
    const prompt = String(config.prompt || '');
    const model = String(config.model || 'googleai/imagen-4.0-fast-generate-001');
    const imageDataUri = config.imageDataUri == null ? undefined : String(config.imageDataUri);
    const aspectRatio = config.aspectRatio == null ? undefined : String(config.aspectRatio);
    const guidanceScale = typeof config.guidanceScale === 'number' ? config.guidanceScale : undefined;
    const seed = typeof config.seed === 'number' ? config.seed : undefined;
    const negativePrompt = config.negativePrompt == null ? undefined : String(config.negativePrompt);

    if (!prompt) {
      throw new Error('Prompt is required for AI image generation');
    }

    try {
      // Call the existing generateImage flow
      const result = await generateImage({
        prompt,
        model,
        imageDataUri,
        aspectRatio,
        guidanceScale,
        seed,
        negativePrompt,
        // This will be fetched server-side in the flow
        userApiKeys: undefined
      });

      // Store result in execution variables
      await execution.updateVariable('ai_image_url', result.imageUrl);

      return {
        success: true,
        imageUrl: result.imageUrl,
        creditsUsed: result.creditsUsed,
        model: result.modelUsed || model
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`AI image generation failed: ${msg}`);
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.prompt) {
      errors.push('Prompt is required');
    }

    if (typeof config.guidanceScale === 'number') {
      if (config.guidanceScale < 1 || config.guidanceScale > 20) {
        errors.push('Guidance scale must be between 1 and 20');
      }
    }

    if (typeof config.seed === 'number') {
      if (config.seed < 0 || config.seed > 4294967295) {
        errors.push('Seed must be between 0 and 4294967295');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
