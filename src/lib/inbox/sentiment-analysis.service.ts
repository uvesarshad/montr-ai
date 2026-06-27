/**
 * Sentiment Analysis Service
 * Analyzes conversation sentiment using AI
 */

import OpenAI from 'openai';
import InboxMessage from '@/lib/db/models/inbox-message.model';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { Types } from 'mongoose';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build',
});

interface SentimentResult {
    sentiment: 'positive' | 'neutral' | 'negative';
    score: number; // -1 to 1
    emotions: string[];
    urgency: 'low' | 'medium' | 'high';
    summary: string;
}

class SentimentAnalysisService {
    /**
     * Analyze sentiment of a message
     */
    async analyzeMessage(messageContent: string): Promise<SentimentResult> {
        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: `You are a sentiment analysis expert. Analyze the sentiment of customer messages and return a JSON response with:
- sentiment: "positive", "neutral", or "negative"
- score: a number from -1 (very negative) to 1 (very positive)
- emotions: array of detected emotions (e.g., ["frustrated", "angry", "confused"])
- urgency: "low", "medium", or "high"
- summary: brief explanation of the sentiment

Return ONLY valid JSON, no other text.`,
                    },
                    {
                        role: 'user',
                        content: messageContent,
                    },
                ],
                temperature: 0.3,
            });

            const result = JSON.parse(response.choices[0].message.content || '{}');
            return result as SentimentResult;
        } catch (error) {
            console.error('Error analyzing sentiment:', error);
            return {
                sentiment: 'neutral',
                score: 0,
                emotions: [],
                urgency: 'low',
                summary: 'Unable to analyze sentiment',
            };
        }
    }

    /**
     * Analyze conversation sentiment (last N messages)
     */
    async analyzeConversation(params: {
        conversationId: Types.ObjectId;
        messageLimit?: number;
    }): Promise<SentimentResult> {
        try {
            // Get recent messages — scoped to the organization to avoid reading
            // another tenant's conversation via a guessed conversationId.
            const messages = await InboxMessage.find({
                conversationId: params.conversationId,
                direction: 'inbound', // Only analyze customer messages
                isNote: false,
            })
                .sort({ createdAt: -1 })
                .limit(params.messageLimit || 5);

            if (messages.length === 0) {
                return {
                    sentiment: 'neutral',
                    score: 0,
                    emotions: [],
                    urgency: 'low',
                    summary: 'No messages to analyze',
                };
            }

            // Combine messages
            const combinedContent = messages
                .reverse()
                .map((m) => m.content)
                .join('\n\n');

            // Analyze
            const sentiment = await this.analyzeMessage(combinedContent);

            // Update conversation metadata (org-scoped).
            await InboxConversation.findOneAndUpdate(
                { _id: params.conversationId },
                {
                    'metadata.sentiment': sentiment.sentiment,
                    'metadata.sentimentScore': sentiment.score,
                    'metadata.emotions': sentiment.emotions,
                    'metadata.urgency': sentiment.urgency,
                }
            );

            return sentiment;
        } catch (error) {
            console.error('Error analyzing conversation sentiment:', error);
            return {
                sentiment: 'neutral',
                score: 0,
                emotions: [],
                urgency: 'low',
                summary: 'Error analyzing conversation',
            };
        }
    }

    /**
     * Auto-escalate based on sentiment
     */
    async autoEscalate(params: {
        conversationId: Types.ObjectId;
        sentiment: SentimentResult;
    }): Promise<boolean> {
        try {
            // Escalate if very negative or high urgency
            if (params.sentiment.score < -0.7 || params.sentiment.urgency === 'high') {
                await InboxConversation.findByIdAndUpdate(params.conversationId, {
                    priority: 'urgent',
                    'metadata.autoEscalated': true,
                    'metadata.escalationReason': params.sentiment.summary,
                });

                console.log(`Conversation ${params.conversationId} auto-escalated due to sentiment`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error auto-escalating conversation:', error);
            return false;
        }
    }

    /**
     * Get sentiment trends for organization
     */
    async getSentimentTrends(params: {
        startDate: Date;
        endDate: Date;
    }): Promise<unknown> {
        try {
            const conversations = await InboxConversation.find({
                createdAt: { $gte: params.startDate, $lte: params.endDate },
                'metadata.sentiment': { $exists: true },
            });

            const sentimentCounts = {
                positive: 0,
                neutral: 0,
                negative: 0,
            };

            const avgScore =
                conversations.reduce((sum, conv) => sum + (conv.metadata?.sentimentScore || 0), 0) /
                conversations.length;

            conversations.forEach((conv) => {
                const sentiment = conv.metadata?.sentiment;
                if (sentiment) {
                    sentimentCounts[sentiment as keyof typeof sentimentCounts]++;
                }
            });

            return {
                total: conversations.length,
                sentimentCounts,
                avgScore,
                positiveRate: (sentimentCounts.positive / conversations.length) * 100,
                negativeRate: (sentimentCounts.negative / conversations.length) * 100,
            };
        } catch (error) {
            console.error('Error getting sentiment trends:', error);
            return null;
        }
    }
}

export const sentimentAnalysisService = new SentimentAnalysisService();
