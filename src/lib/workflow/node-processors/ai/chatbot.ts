/**
 * AI chatbot processor.
 *
 * Multi-turn chat node — accepts a system prompt + a sequence of messages
 * (either passed inline or pulled from upstream node output) and returns the
 * model's reply. Backed by the existing `generateText` flow so it picks up
 * user routing / BYOK / credit-deduction logic for free.
 *
 * Config:
 *   model?: string                     — default openai/gpt-4o
 *   systemPrompt?: string              — persona / instructions
 *   messages?: Array<{role, content}>  — full chat history (preferred)
 *   userMessage?: string               — single-turn shortcut
 *   temperature?: number
 *   maxTokens?: number
 *   memoryKey?: string                 — variable key to persist running history
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { runMeteredWorkflowAI } from '../../metered-ai';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ChatbotProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const model = String(config.model || 'openai/gpt-4o');
    const systemPrompt = typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined;
    const temperature = typeof config.temperature === 'number' ? config.temperature : undefined;
    const maxTokens = typeof config.maxTokens === 'number' ? config.maxTokens : undefined;

    const inlineMessages: ChatMessage[] = Array.isArray(config.messages)
      ? (config.messages as unknown[]).filter(
          (m): m is ChatMessage =>
            !!m && typeof m === 'object' && typeof (m as { content?: unknown }).content === 'string'
        )
      : [];

    const userMessage: string | undefined =
      typeof config.userMessage === 'string' ? config.userMessage : undefined;

    const messages: ChatMessage[] = inlineMessages.length
      ? inlineMessages
      : userMessage
        ? [{ role: 'user', content: userMessage }]
        : [];

    if (messages.length === 0) {
      throw new Error('Chatbot: provide either "messages" or "userMessage".');
    }

    // Compose into a single prompt the underlying flow expects. We keep the
    // chat structure visible so the model knows it's a conversation.
    const conversation = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const result = await runMeteredWorkflowAI(context, {
      model,
      system: systemPrompt || "You are a helpful AI assistant. Follow the user's instructions carefully.",
      messages: [{ role: 'user', content: conversation }],
      temperature,
      maxTokens,
    });

    const reply = (result?.text || '').trim();

    // Optional rolling memory — append the new turn to a workflow variable so
    // downstream chatbot nodes can pick up the conversation.
    if (typeof config.memoryKey === 'string' && config.memoryKey) {
      const assistantTurn: ChatMessage = { role: 'assistant', content: reply };
      const next: ChatMessage[] = [...messages, assistantTurn].slice(-50); // cap history
      try {
        await execution.updateVariable(config.memoryKey, next);
      } catch {
        /* non-fatal */
      }
    }

    await execution.updateVariable('chatbot_reply', reply).catch(() => {});

    return {
      success: true,
      reply,
      model,
      creditsUsed: result?.creditsUsed,
      messageCount: messages.length + 1,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.userMessage && !(Array.isArray(config.messages) && config.messages.length > 0)) {
      errors.push('Either "userMessage" or non-empty "messages" array is required');
    }
    if (typeof config.temperature === 'number' && (config.temperature < 0 || config.temperature > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }
    if (typeof config.maxTokens === 'number' && (config.maxTokens < 1 || config.maxTokens > 8192)) {
      errors.push('Max tokens must be between 1 and 8192');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
