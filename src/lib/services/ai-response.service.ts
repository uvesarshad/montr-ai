import { generateTextWithClient } from '@/ai/client';
import CrmActivity from '@/lib/db/models/crm/activity.model';

export interface ConversationMessage {
    messageMetadata?: {
        direction?: 'inbound' | 'outbound';
    };
    bodyPlain?: string;
}

export interface ContactInfo {
    firstName?: string;
    lastName?: string;
    tags?: string[];
}

export interface AIResponseInput {
    contactId: string;
    currentMessage: string;
    conversationHistory?: ConversationMessage[];
    contactInfo?: ContactInfo;
}

/**
 * AI Response Service
 * Generates context-aware responses using existing AI infrastructure
 */
export class AIResponseService {
    /**
     * Generate an AI-powered response suggestion
     */
    async generateResponse(input: AIResponseInput): Promise<string> {
        try {
            // Fetch recent conversation history if not provided
            let history = input.conversationHistory;

            if (!history) {
                history = await CrmActivity.find({
                    contactId: input.contactId,
                    type: 'message',
                    'messageMetadata.channel': 'whatsapp',
                })
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .lean();
            }

            // Build conversation context
            const conversationContext = history
                .reverse()
                .map((msg: ConversationMessage) => {
                    const direction = msg.messageMetadata?.direction || 'unknown';
                    const text = msg.bodyPlain || '';
                    return `${direction === 'inbound' ? 'Customer' : 'Agent'}: ${text}`;
                })
                .join('\n');

            // Build contact context
            const contactContext = input.contactInfo
                ? `Contact Name: ${input.contactInfo.firstName || ''} ${input.contactInfo.lastName || ''}\n` +
                `Tags: ${input.contactInfo.tags?.join(', ') || 'None'}\n`
                : '';

            // Use existing AI infrastructure
            const response = await generateTextWithClient({
                model: 'gemini-2.0-flash-exp',
                system: 'You are a helpful customer service agent responding to WhatsApp messages.',
                messages: [
                    {
                        role: 'user',
                        content: `${contactContext}Recent Conversation:\n${conversationContext}\n\nCustomer's Latest Message: ${input.currentMessage}\n\nGenerate a concise, helpful response (2-3 sentences max):`,
                    },
                ],
                temperature: 0.7,
                maxTokens: 150,
            });

            return response.trim();
        } catch (error) {
            console.error('Error generating AI response:', error);
            throw error;
        }
    }

    /**
     * Generate multiple response suggestions
     */
    async generateMultipleSuggestions(input: AIResponseInput, count: number = 3): Promise<string[]> {
        const suggestions: string[] = [];

        for (let i = 0; i < count; i++) {
            try {
                const suggestion = await this.generateResponse(input);
                suggestions.push(suggestion);
            } catch (error) {
                console.error(`Error generating suggestion ${i + 1}:`, error);
            }
        }

        return suggestions;
    }
}

export const aiResponseService = new AIResponseService();
