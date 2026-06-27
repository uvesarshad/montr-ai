/**
 * AI bot conversation runtime — text channels (WhatsApp + Inbox).
 *
 * For voice, the wiring is in `src/lib/voice/server/ws-handler.ts` which
 * configures `VoiceConversationEngine` with the bot's system prompt + character
 * voice + KB context. The text-side runtime here is the cross-channel
 * orchestration for non-streaming reply turns.
 *
 * Flow per turn:
 *   1. Load bot, validate active + channel-enabled.
 *   2. Compose system prompt (bot + character personality/style).
 *   3. Load/create conversation state.
 *   4. Auto-inject KB context if bot has knowledgeBaseIds.
 *   5. Call generateTextWithClient with the bot's tool registry.
 *   6. Persist user + assistant turns into state.
 *   7. Sender delivers the reply on-channel.
 */

import { CoreMessage, CoreTool, tool } from 'ai';

import AiCharacter from '@/lib/db/models/ai-character.model';
import { aiBotRepository } from '@/lib/db/repository/ai-bot.repository';
import { aiBotConversationStateRepository } from '@/lib/db/repository/ai-bot-conversation-state.repository';
import { generateTextWithClient } from '@/ai/client';

import { getBotTools, ESCALATE_TOOL_NAME } from './tools';
import { searchKnowledgeBaseTool } from './tools/search-knowledge-base';
import type { BotToolContext } from './tools/types';
import type { BotSender } from './senders/types';
import type { AiBotChannel } from '@/lib/db/models/ai-bot.model';

export interface RunAiBotTurnInput {
  botId: string;
  channel: AiBotChannel;
  conversationId: string;
  brandId?: string | null;
  contactId?: string | null;
  inboundMessage: string;
  sender: BotSender;
}

export interface RunAiBotTurnResult {
  reply: string | null;
  escalationRequested: boolean;
  toolCalls: Array<{ name: string; ok: boolean }>;
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TURNS = 6;

function composeSystemPrompt(parts: {
  systemPrompt: string;
  personality?: string;
  styleDescriptors?: string[];
  kbContext?: string;
}): string {
  const out: string[] = [];
  if (parts.personality) out.push(`Personality: ${parts.personality}`);
  if (parts.styleDescriptors?.length) {
    out.push(`Style: ${parts.styleDescriptors.join(', ')}`);
  }
  out.push(parts.systemPrompt);
  if (parts.kbContext) {
    out.push(
      `\nRelevant context from the knowledge base:\n${parts.kbContext}\n\nUse this context when relevant. If it doesn't answer the question, call searchKnowledgeBase for a more specific query.`,
    );
  }
  return out.join('\n\n');
}

export async function runAiBotTurn(input: RunAiBotTurnInput): Promise<RunAiBotTurnResult> {
  const bot = await aiBotRepository.findActiveById(input.botId, input.channel);
  if (!bot) {
    throw new Error(`AiBot ${input.botId} not found, archived, or not enabled for channel '${input.channel}'.`);
  }

  let personality: string | undefined;
  let styleDescriptors: string[] | undefined;
  if (bot.aiCharacterId) {
    const character = await AiCharacter.findById(bot.aiCharacterId).lean();
    if (character) {
      personality = character.personality;
      styleDescriptors = character.styleDescriptors;
    }
  }

  const state = await aiBotConversationStateRepository.findOrCreate({
    brandId: input.brandId,
    aiBotId: input.botId,
    channel: input.channel,
    conversationId: input.conversationId,
    contactId: input.contactId,
  });

  const toolCtx: BotToolContext = {
    brandId: input.brandId,
    aiBotId: input.botId,
    channel: input.channel,
    conversationId: input.conversationId,
    contactId: input.contactId,
    stateId: String(state._id),
    actor: 'ai_bot',
  };

  let kbContext: string | undefined;
  if (bot.knowledgeBaseIds.length > 0) {
    try {
      const result = await searchKnowledgeBaseTool.execute(toolCtx, {
        query: input.inboundMessage,
      });
      if (typeof result === 'string' && result && !result.startsWith('No relevant')) {
        kbContext = result;
      }
    } catch (err) {
      console.error('[ai-bot.runtime] KB auto-inject failed:', err);
    }
  }

  const system = composeSystemPrompt({
    systemPrompt: bot.systemPrompt,
    personality,
    styleDescriptors,
    kbContext,
  });

  const messages: CoreMessage[] = [];
  if (state.summary) {
    messages.push({
      role: 'system',
      content: `Earlier in this conversation: ${state.summary}`,
    });
  }
  for (const turn of state.lastTurns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: turn.content });
    } else if (turn.role === 'assistant') {
      messages.push({ role: 'assistant', content: turn.content });
    }
  }
  messages.push({ role: 'user', content: input.inboundMessage });

  const toolRegistry = getBotTools(input.channel);
  const toolCallsTrace: Array<{ name: string; ok: boolean }> = [];

  const aiTools: Record<string, CoreTool> = {};
  for (const [name, t] of Object.entries(toolRegistry)) {
    aiTools[name] = tool({
      description: t.description,
      parameters: t.parameters,
      execute: async (args: unknown) => {
        try {
          const out = await t.execute(toolCtx, args);
          toolCallsTrace.push({ name, ok: true });
          return out;
        } catch (err) {
          toolCallsTrace.push({ name, ok: false });
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });
  }

  const maxSteps = bot.routingDefaults?.maxToolCallsPerTurn ?? DEFAULT_MAX_TURNS;

  const replyText = await generateTextWithClient({
    model: bot.llmModel ?? DEFAULT_MODEL,
    system,
    messages,
    temperature: bot.temperature,
    tools: aiTools,
    maxSteps,
  }).catch((err) => {
    console.error('[ai-bot.runtime] generateText failed:', err);
    throw err;
  });

  await aiBotConversationStateRepository.appendTurn(String(state._id), {
    role: 'user',
    content: input.inboundMessage,
    ts: new Date(),
  });

  const trimmedReply = (replyText ?? '').trim();
  if (trimmedReply) {
    await aiBotConversationStateRepository.appendTurn(String(state._id), {
      role: 'assistant',
      content: trimmedReply,
      ts: new Date(),
    });
  }

  void aiBotRepository.incrementUsage(input.botId);

  const escalated =
    toolCallsTrace.some((c) => c.name === ESCALATE_TOOL_NAME && c.ok) ||
    (await aiBotConversationStateRepository
      .findByConversation(input.botId, input.conversationId)
      .then((s) => s?.escalationRequested ?? false));

  if (trimmedReply) {
    try {
      await input.sender.send(trimmedReply);
    } catch (err) {
      console.error('[ai-bot.runtime] sender.send failed:', err);
    }
  }

  return {
    reply: trimmedReply || null,
    escalationRequested: escalated,
    toolCalls: toolCallsTrace,
  };
}
