import OpenAI from 'openai';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { whatsappContactRepository } from '@/lib/db/repository/whatsapp-contact.repository';

/**
 * AI Chatbot Service for WhatsApp
 * Uses OpenAI to generate contextual responses
 */

interface ChatbotConfig {
  apiKey: string;
  model?: string; // Default: gpt-3.5-turbo
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  contextMessages?: number; // Number of previous messages to include
}

interface ChatbotContext {
  contactId: string;
  accountId: string;
  businessName?: string;
  businessDescription?: string;
}

/**
 * Generate AI-powered response to incoming message
 */
export async function generateChatbotResponse(
  incomingMessage: string,
  context: ChatbotContext,
  config: ChatbotConfig
): Promise<{ response: string; confidence: number }> {
  try {
    const openai = new OpenAI({
      apiKey: config.apiKey,
    });

    const model = config.model || 'gpt-3.5-turbo';
    const maxTokens = config.maxTokens || 500;
    const temperature = config.temperature !== undefined ? config.temperature : 0.7;
    const contextMessagesCount = config.contextMessages || 5;

    // Get contact information
    const contact = await whatsappContactRepository.findById(context.contactId);
    const contactName = contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : 'Customer';

    // Get conversation history
    const messageHistory = await whatsappMessageRepository.find({
      accountId: context.accountId,
      contactId: context.contactId,
    });

    // Sort by createdAt and get last N messages
    const recentMessages = messageHistory
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-contextMessagesCount);

    // Build conversation context for AI
    const conversationContext = recentMessages
      .map((msg) => {
        // @ts-expect-error
        const role = msg.type === 'incoming' ? 'Customer' : 'Assistant';
        return `${role}: ${msg.content}`;
      })
      .join('\n');

    // Build system prompt
    const defaultSystemPrompt = `You are a helpful customer service assistant for ${context.businessName || 'our company'}. ${
      context.businessDescription ? `\n\nAbout the business: ${context.businessDescription}` : ''
    }

Your role is to:
- Provide helpful and accurate information
- Be polite, professional, and friendly
- Keep responses concise and clear (under 200 words)
- Ask clarifying questions when needed
- Escalate to human support when appropriate

Current customer: ${contactName}

Previous conversation:
${conversationContext}

Respond to the customer's message appropriately based on the context. If you don't have enough information or the query is too complex, suggest connecting with a human agent.`;

    const systemPrompt = config.systemPrompt || defaultSystemPrompt;

    // Generate response
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: incomingMessage,
        },
      ],
      max_tokens: maxTokens,
      temperature,
    });

    const response = completion.choices[0]?.message?.content?.trim() || '';

    // Calculate confidence based on finish_reason
    const finishReason = completion.choices[0]?.finish_reason;
    let confidence = 0.8; // Default confidence

    if (finishReason === 'stop') {
      confidence = 0.9; // High confidence - natural completion
    } else if (finishReason === 'length') {
      confidence = 0.6; // Medium confidence - hit token limit
    } else {
      confidence = 0.5; // Low confidence - other reasons
    }

    return {
      response,
      confidence,
    };
  } catch (error: unknown) {
    console.error('Chatbot generation error:', error);
    throw new Error(`Failed to generate chatbot response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Determine if chatbot should respond to a message
 */
export async function shouldRespondWithChatbot(
  message: string,
  context: ChatbotContext,
  settings: {
    enabled: boolean;
    confidenceThreshold?: number; // Minimum confidence to auto-send (default 0.8)
    keywords?: string[]; // Optional keywords to trigger chatbot
    businessHours?: boolean; // Only during business hours
    maxMessagesPerDay?: number; // Rate limit per contact
  }
): Promise<{ shouldRespond: boolean; reason?: string }> {
  if (!settings.enabled) {
    return { shouldRespond: false, reason: 'Chatbot disabled' };
  }

  // Check rate limiting
  if (settings.maxMessagesPerDay) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMessages = await whatsappMessageRepository.find({
      accountId: context.accountId,
      contactId: context.contactId,
      createdAt: { $gte: today },
      'metadata.aiGenerated': true,
    });

    if (todayMessages.length >= settings.maxMessagesPerDay) {
      return { shouldRespond: false, reason: 'Rate limit exceeded' };
    }
  }

  // Check keywords if specified
  if (settings.keywords && settings.keywords.length > 0) {
    const hasKeyword = settings.keywords.some((keyword) =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    if (!hasKeyword) {
      return { shouldRespond: false, reason: 'No matching keywords' };
    }
  }

  // Check business hours if required
  if (settings.businessHours) {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Skip weekends
    if (day === 0 || day === 6) {
      return { shouldRespond: false, reason: 'Outside business hours (weekend)' };
    }

    // Business hours: 9 AM - 6 PM
    if (hour < 9 || hour >= 18) {
      return { shouldRespond: false, reason: 'Outside business hours' };
    }
  }

  return { shouldRespond: true };
}

/**
 * Process incoming message and potentially send AI response
 */
export async function processWithChatbot(
  incomingMessage: string,
  context: ChatbotContext,
  config: ChatbotConfig,
  settings: {
    enabled: boolean;
    autoSend?: boolean; // Auto-send if confidence above threshold
    confidenceThreshold?: number;
    keywords?: string[];
    businessHours?: boolean;
    maxMessagesPerDay?: number;
  }
): Promise<{
  responded: boolean;
  response?: string;
  confidence?: number;
  reason?: string;
}> {
  try {
    // Check if should respond
    const shouldRespond = await shouldRespondWithChatbot(incomingMessage, context, settings);

    if (!shouldRespond.shouldRespond) {
      return {
        responded: false,
        reason: shouldRespond.reason,
      };
    }

    // Generate response
    const result = await generateChatbotResponse(incomingMessage, context, config);

    // Auto-send if enabled and confidence above threshold
    const threshold = settings.confidenceThreshold || 0.8;
    const autoSend = settings.autoSend !== false; // Default true

    if (autoSend && result.confidence >= threshold) {
      return {
        responded: true,
        response: result.response,
        confidence: result.confidence,
      };
    }

    // Return suggestion without auto-sending
    return {
      responded: false,
      response: result.response,
      confidence: result.confidence,
      reason: `Confidence ${result.confidence.toFixed(2)} below threshold ${threshold}`,
    };
  } catch (error: unknown) {
    console.error('Chatbot processing error:', error);
    return {
      responded: false,
      reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
