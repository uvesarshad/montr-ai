import { generateText, CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { Types } from 'mongoose';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';
import { findModelById } from '@/lib/model-groups';
import { IInboxChannel } from '@/lib/db/models/inbox-channel.model';
import InboxMessage from '@/lib/db/models/inbox-message.model';
import { dbConnect } from '@/lib/db/connect';

function isBotOnline(channel: IInboxChannel): boolean {
  const schedule = channel.config.schedule;
  if (!schedule?.enabled || !schedule.hours?.length) return true;

  try {
    const tz = schedule.timezone || 'UTC';
    const now = new Date();
    const localStr = now.toLocaleString('en-US', { timeZone: tz, hour12: false });
    const local = new Date(localStr);
    const day = local.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const hhmm = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;

    return schedule.hours.some(
      (h) => h.day === day && hhmm >= h.open && hhmm < h.close,
    );
  } catch {
    return true;
  }
}

const TYPE_SYSTEM_PROMPTS: Record<string, string> = {
  support:
    'You are a helpful customer support assistant. Resolve issues clearly and concisely. If you cannot help, offer to connect the visitor with a human agent.',
  'lead generation':
    'You are a friendly lead qualification assistant. Help understand visitor needs, gather contact information naturally, and identify high-value opportunities for the sales team.',
  faq:
    'You are a knowledgeable FAQ assistant. Answer questions accurately using the provided knowledge base. Keep answers concise and direct.',
  custom: 'You are a helpful AI assistant.',
};

function buildSystemPrompt(channel: IInboxChannel): string {
  const custom = channel.config.systemPrompt?.trim();
  const type = (channel.config.chatbotType || 'support').toLowerCase();
  const base = custom || TYPE_SYSTEM_PROMPTS[type] || TYPE_SYSTEM_PROMPTS.support;

  const supportsQuickReplies = type === 'faq' || type === 'lead generation';
  if (!supportsQuickReplies) return base;

  return (
    base +
    '\n\nWhen it helps the visitor choose a next step, you may append a JSON block at the very end of your response in this exact format (do not explain it, just append it):\n' +
    '```json\n{"quickReplies":[{"label":"Option 1","value":"option 1"},{"label":"Option 2","value":"option 2"}]}\n```\n' +
    'Only include it when it genuinely helps. Limit to 4 options. Never include it mid-response.'
  );
}

function extractQuickReplies(text: string): { text: string; quickReplies: QuickReply[] } {
  const match = text.match(/```json\s*(\{[\s\S]*?"quickReplies"[\s\S]*?\})\s*```/);
  if (!match) return { text, quickReplies: [] };

  try {
    const parsed = JSON.parse(match[1]);
    const quickReplies: QuickReply[] = Array.isArray(parsed.quickReplies)
      ? parsed.quickReplies.slice(0, 4).map((r: { label?: string; value?: string }) => ({
          label: String(r.label || ''),
          value: String(r.value || r.label || ''),
        }))
      : [];
    const cleanText = text.replace(match[0], '').trim();
    return { text: cleanText, quickReplies };
  } catch {
    return { text, quickReplies: [] };
  }
}

function isHandoffTriggered(message: string, channel: IInboxChannel): boolean {
  const triggers = channel.config.handoffTriggers ?? [];
  if (!triggers.length) return false;
  const lower = message.toLowerCase();
  return triggers.some((t) => lower.includes(t.toLowerCase()));
}

async function loadHistory(conversationId: string, limit = 20): Promise<CoreMessage[]> {
  try {
    const msgs = await InboxMessage.find({
      conversationId: new Types.ObjectId(conversationId),
      isNote: false,
      messageType: 'text',
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return msgs.reverse().map(
      (m) =>
        ({
          role: m.direction === 'inbound' ? 'user' : 'assistant',
          content: m.content,
        }) as CoreMessage,
    );
  } catch {
    return [];
  }
}

function resolveModel(modelId: string): ReturnType<ReturnType<typeof createOpenAI>> {
  const def = findModelById(modelId);
  const provider = def?.provider ?? 'openai';

  // Strip provider prefix if present (e.g. "openai/gpt-4o" → "gpt-4o")
  const rawId = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;

  if (provider === 'openai') {
    const client = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return client(rawId);
  }

  // For other providers (anthropic, google) fall back to the default OpenAI model
  // since those require Genkit which has a different calling convention.
  console.warn(`[ChatbotAI] Provider '${provider}' not supported via AI SDK, falling back to gpt-4o`);
  const client = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client('gpt-4o');
}

export interface QuickReply {
  label: string;
  value: string;
}

export interface ChatbotReplyResult {
  text: string;
  handoff: boolean;
  quickReplies?: QuickReply[];
}

export async function generateChatbotReply(params: {
  channel: IInboxChannel;
  userMessage: string;
  conversationId?: string;
}): Promise<ChatbotReplyResult> {
  const { channel, userMessage, conversationId } = params;
  const userId = channel.createdById.toString();
  const modelId = channel.config.aiModel || 'gpt-4o';

  await dbConnect();

  // Check operating hours
  if (!isBotOnline(channel)) {
    const offlineMsg = channel.config.schedule?.offlineMessage
      ?? "We're currently offline. Leave a message and we'll get back to you.";
    return { text: offlineMsg, handoff: false };
  }

  // Check handoff triggers before calling AI
  const handoff = isHandoffTriggered(userMessage, channel);
  if (handoff && channel.config.autoTransferToHuman) {
    return {
      text: "Let me connect you with a human agent who can assist you further.",
      handoff: true,
    };
  }

  // Credit guard
  const creditCheck = await checkAICredits(userId, modelId);
  if (!creditCheck.allowed) {
    return {
      text: "I'm currently unavailable. Please try again later or contact support directly.",
      handoff: false,
    };
  }

  // Load conversation history (exclude the message we just stored to avoid duplication)
  const rawHistory = conversationId ? await loadHistory(conversationId) : [];
  const history = rawHistory.length > 0 && rawHistory[rawHistory.length - 1]?.content === userMessage
    ? rawHistory.slice(0, -1)
    : rawHistory;

  const messages: CoreMessage[] = [...history, { role: 'user', content: userMessage }];
  const system = buildSystemPrompt(channel);

  try {
    const { text } = await generateText({
      model: resolveModel(modelId) as Parameters<typeof generateText>[0]['model'],
      system,
      messages,
      maxTokens: 1024,
    });

    await consumeAICredits(userId, modelId, 'text', false);

    const rawText = text || "I'm here to help! Could you provide more details?";
    const { text: cleanText, quickReplies } = extractQuickReplies(rawText);
    return { text: cleanText, handoff: false, quickReplies: quickReplies.length > 0 ? quickReplies : undefined };
  } catch (err: unknown) {
    console.error('[ChatbotAI] Generation failed:', err instanceof Error ? err.message : String(err));
    return {
      text: "I'm having trouble responding right now. Please try again in a moment.",
      handoff: false,
    };
  }
}
