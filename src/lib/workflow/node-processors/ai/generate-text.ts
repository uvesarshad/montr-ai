/**
 * AI Generate Text Processor
 *
 * Routes through `runMeteredWorkflowAI` (NOT the `generate-text-flow`, which
 * relies on `auth()` and therefore throws Unauthorized in the BullMQ worker).
 * Identity is resolved from the execution record so credits/BYOK/plan apply.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { runMeteredWorkflowAI } from '../../metered-ai';

export class GenerateTextProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    // Get AI configuration
    const prompt = String(config.prompt || '');
    const model = String(config.model || 'openai/gpt-4o');
    const systemPrompt = config.systemPrompt == null ? undefined : String(config.systemPrompt);
    const temperature = typeof config.temperature === 'number' ? config.temperature : undefined;
    const maxTokens = typeof config.maxTokens === 'number' ? config.maxTokens : undefined;
    const contextData = String(config.context || '');

    if (!prompt) {
      throw new Error('Prompt is required for AI text generation');
    }

    try {
      const finalSystemPrompt =
        systemPrompt || "You are a helpful AI assistant. Follow the user's instructions carefully.";
      const fullPrompt = contextData
        ? `Context:\n---\n${contextData}\n---\n\nInstruction: ${prompt}`
        : prompt;

      const result = await runMeteredWorkflowAI(context, {
        model,
        system: finalSystemPrompt,
        messages: [{ role: 'user', content: fullPrompt }],
        temperature,
        maxTokens,
      });

      // Store result in execution variables
      await execution.updateVariable('ai_response', result.text);

      return {
        success: true,
        text: result.text,
        creditsUsed: result.creditsUsed,
        model
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`AI text generation failed: ${msg}`);
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.prompt) {
      errors.push('Prompt is required');
    }

    if (typeof config.temperature === 'number') {
      if (config.temperature < 0 || config.temperature > 2) {
        errors.push('Temperature must be between 0 and 2');
      }
    }

    if (typeof config.maxTokens === 'number') {
      if (config.maxTokens < 1 || config.maxTokens > 4096) {
        errors.push('Max tokens must be between 1 and 4096');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
