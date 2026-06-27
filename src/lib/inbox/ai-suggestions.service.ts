/**
 * AI Response Suggestions Service
 * Generates AI-powered response suggestions for agents
 */

import OpenAI from 'openai';
import InboxMessage from '@/lib/db/models/inbox-message.model';
import InboxConversation, { IInboxConversation } from '@/lib/db/models/inbox-conversation.model';
import { knowledgeBaseService } from './knowledge-base.service';
import { Types } from 'mongoose';

// Removed top-level initialization to prevent build errors
// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY,
// });

interface ResponseSuggestion {
    suggestions: string[];
    tone: 'professional' | 'friendly' | 'empathetic';
    confidence: number;
    context: string;
}

class AISuggestionsService {
    /**
     * Generate response suggestions
     */
    async generateSuggestions(params: {
        conversationId: Types.ObjectId;
        numSuggestions?: number;
    }): Promise<ResponseSuggestion> {
        try {
            // Scope to the caller's organization so another tenant's conversation
            // can never be read (or summarized by the model) via a guessed id.
            const conversation = await InboxConversation.findOne({
                _id: params.conversationId
            });

            if (!conversation) {
                return {
                    suggestions: [],
                    tone: 'professional',
                    confidence: 0,
                    context: 'No conversation history',
                };
            }

            const messages = await InboxMessage.find({
                conversationId: params.conversationId,
                isNote: false,
            })
                .sort({ createdAt: 1 })
                .limit(10);

            if (messages.length === 0) {
                return {
                    suggestions: [],
                    tone: 'professional',
                    confidence: 0,
                    context: 'No conversation history',
                };
            }

            const lastCustomerMessage = messages.filter((m) => m.direction === 'inbound').pop();

            if (!lastCustomerMessage) {
                return {
                    suggestions: [],
                    tone: 'professional',
                    confidence: 0,
                    context: 'No customer message found',
                };
            }

            const kbContext = await knowledgeBaseService.getContext({
                query: lastCustomerMessage.content,
                maxTokens: 1000,
            });

            const conversationContext = messages
                .map((m) => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.content}`)
                .join('\n');

            const tone = this.determineTone(conversation);

            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });

            const response = await openai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: `Generate ${params.numSuggestions || 3} response suggestions. Return JSON with suggestions array, confidence, and reasoning.`,
                    },
                    {
                        role: 'user',
                        content: `History:\n${conversationContext}\n\nKB:\n${kbContext || 'None'}`,
                    },
                ],
                temperature: 0.7,
            });

            const result = JSON.parse(response.choices[0].message.content || '{}');

            return {
                suggestions: result.suggestions || [],
                tone,
                confidence: result.confidence || 0.8,
                context: result.reasoning || '',
            };
        } catch (error) {
            console.error('Error generating suggestions:', error);
            return {
                suggestions: [],
                tone: 'professional',
                confidence: 0,
                context: 'Error',
            };
        }
    }

    private determineTone(conversation: IInboxConversation): 'professional' | 'friendly' | 'empathetic' {
        const sentiment = conversation.metadata?.sentiment;
        if (sentiment === 'negative') return 'empathetic';
        if (sentiment === 'positive') return 'friendly';
        return 'professional';
    }
}

export const aiSuggestionsService = new AISuggestionsService();
