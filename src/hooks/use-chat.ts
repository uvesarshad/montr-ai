'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { streamChatResponse, summarizeChatHistory } from '@/ai/flows';
import { useToast } from '@/hooks/use-toast';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    model?: string;
    timestamp: Date;
}

interface Conversation {
    _id: string;
    title: string;
    lastMessage?: string;
    lastModel?: string;
    lastModelRouteHint?: {
        sdk: string;
        provider: string;
        keySource: string;
    };
    messages: Message[];
    conversationSummary?: string;
    lastSummarizedIndex: number;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
}

interface UseChatOptions {
    conversationId?: string;
    onTitleGenerated?: (title: string) => void;
}

const SUMMARY_THRESHOLD = 15;
const RECENT_MESSAGES_COUNT = 8;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useChat({ conversationId, onTitleGenerated }: UseChatOptions = {}) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [selectedModelRouteHint, setSelectedModelRouteHint] = useState<{ sdk: string; provider: string; keySource: string } | null | undefined>(null);

    const { data: conversation, mutate, isLoading: isLoadingConversation } = useSWR<Conversation>(
        conversationId ? `/api/v2/conversations/${conversationId}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
        }
    );

    // Set initial model from conversation
    useEffect(() => {
        if (conversation?.lastModel && !selectedModel) {
            setSelectedModel(conversation.lastModel);
            if (conversation.lastModelRouteHint) {
                setSelectedModelRouteHint(conversation.lastModelRouteHint);
            }
        }
    }, [conversation, selectedModel]);

    const messages = useMemo(() => conversation?.messages ?? [], [conversation]);

    const updateConversation = useCallback(
        async (data: Partial<Conversation>) => {
            if (!conversationId) return;

            const response = await fetch(`/api/v2/conversations/${conversationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error('Failed to update conversation');
            }

            const updated = await response.json();
            mutate(updated, false);
            return updated;
        },
        [conversationId, mutate]
    );

    const generateTitle = useCallback(
        async (msgs: Message[]) => {
            if (!conversationId || msgs.length < 3) return;
            if (conversation?.title && conversation.title !== 'New Chat') return;

            try {
                // Use first few messages to generate a title
                const contextMessages = msgs.slice(0, 4);
                const prompt = `Based on this conversation, generate a short 3-5 word title (no quotes):
${contextMessages.map((m) => `${m.role}: ${m.content.substring(0, 100)}`).join('\n')}`;

                const stream = await streamChatResponse({
                    prompt,
                    model: selectedModel || 'openai/gpt-4o-mini',
                    stream: true,
                    useKnowledgeBase: false,
                    useAgentActions: false,
                });

                let title = '';
                for await (const chunk of stream) {
                    title += chunk;
                }

                title = title.trim().replace(/^["']|["']$/g, '').substring(0, 50);

                if (title) {
                    await updateConversation({ title });
                    onTitleGenerated?.(title);
                }
            } catch (error) {
                console.error('Failed to generate title:', error);
            }
        },
        [conversationId, conversation?.title, selectedModel, updateConversation, onTitleGenerated]
    );

    const triggerSummarization = useCallback(
        async (currentMessages: Message[], lastSummarizedIndex: number, currentSummary?: string) => {
            if (currentMessages.length <= SUMMARY_THRESHOLD) return;
            if (lastSummarizedIndex >= currentMessages.length - RECENT_MESSAGES_COUNT) return;

            const newMessagesToSummarize = currentMessages.slice(
                lastSummarizedIndex + 1,
                -RECENT_MESSAGES_COUNT
            );
            if (newMessagesToSummarize.length === 0) return;

            try {
                const result = await summarizeChatHistory({
                    history: newMessagesToSummarize.map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                    currentSummary: currentSummary || '',
                });

                const newSummary = result.summary;
                const newLastSummarizedIndex = currentMessages.length - RECENT_MESSAGES_COUNT - 1;

                await updateConversation({
                    conversationSummary: newSummary,
                    lastSummarizedIndex: newLastSummarizedIndex,
                });

                toast({
                    title: 'Conversation memory updated',
                    description: 'The AI has summarized older parts of your chat.',
                });
            } catch (error) {
                console.error('Summarization failed:', error);
            }
        },
        [updateConversation, toast]
    );

    const sendMessage = useCallback(
        async (content: string) => {
            if (!content.trim() || !selectedModel || !conversationId) {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Please select a model and enter a message.',
                });
                return;
            }

            setIsLoading(true);

            const userMessage: Message = {
                role: 'user',
                content,
                timestamp: new Date(),
            };

            // Optimistically add user message
            const updatedMessages = [...messages, userMessage];
            mutate(
                {
                    ...conversation!,
                    messages: updatedMessages,
                },
                false
            );

            try {
                // Prepare history with summary if available
                const historyForPrompt: Array<{ role: 'user' | 'assistant'; content: string }> = [];
                const lastSummarizedIndex = conversation?.lastSummarizedIndex ?? -1;

                if (conversation?.conversationSummary) {
                    historyForPrompt.push({
                        role: 'assistant',
                        content: `Previous conversation summary: ${conversation.conversationSummary}`,
                    });
                }

                const recentMessages = updatedMessages.slice(lastSummarizedIndex + 1, -1);
                historyForPrompt.push(
                    ...recentMessages.map((m) => ({ role: m.role, content: m.content }))
                );

                const stream = await streamChatResponse({
                    prompt: content,
                    history: historyForPrompt,
                    model: selectedModel,
                    routeHint: selectedModelRouteHint as { sdk: 'genkit' | 'aisdk'; provider: string; keySource: 'user' | 'system' } | null | undefined,
                    stream: true,
                    useKnowledgeBase: false,
                    useAgentActions: false,
                });

                let assistantContent = '';
                const assistantMessage: Message = {
                    role: 'assistant',
                    content: '',
                    model: selectedModel,
                    timestamp: new Date(),
                };

                // Stream in the response
                for await (const chunk of stream) {
                    assistantContent += chunk;
                    assistantMessage.content = assistantContent;
                    mutate(
                        {
                            ...conversation!,
                            messages: [...updatedMessages, { ...assistantMessage }],
                        },
                        false
                    );
                }

                // Save final messages to DB
                const finalMessages = [...updatedMessages, assistantMessage];
                await updateConversation({
                    messages: finalMessages,
                    lastMessage: assistantContent.substring(0, 100),
                    lastModel: selectedModel,
                    lastModelRouteHint: selectedModelRouteHint ?? undefined,
                });

                // Trigger title generation after 3rd message
                if (finalMessages.length === 3 || finalMessages.length === 4) {
                    generateTitle(finalMessages);
                }

                // Trigger summarization if needed
                triggerSummarization(
                    finalMessages,
                    lastSummarizedIndex,
                    conversation?.conversationSummary
                );
            } catch (error) {
                console.error('Chat error:', error);
                toast({
                    variant: 'destructive',
                    title: 'Chat Error',
                    description: error instanceof Error ? error.message : 'Failed to send message.',
                });
                // Revert on error
                mutate();
            } finally {
                setIsLoading(false);
            }
        },
        [
            conversationId,
            conversation,
            messages,
            selectedModel,
            selectedModelRouteHint,
            mutate,
            updateConversation,
            generateTitle,
            triggerSummarization,
            toast,
        ]
    );

    const handleModelChange = useCallback((modelId: string, model: { routeHint?: { sdk: string; provider: string; keySource: string } | null }) => {
        setSelectedModel(modelId);
        setSelectedModelRouteHint(model.routeHint ?? undefined);
    }, []);

    const clearHistory = useCallback(async () => {
        if (!conversationId) return;

        await updateConversation({
            messages: [],
            conversationSummary: undefined,
            lastSummarizedIndex: -1,
            lastMessage: undefined,
        });

        toast({
            title: 'History Cleared',
            description: "The conversation's history has been reset.",
        });
    }, [conversationId, updateConversation, toast]);

    return {
        conversation,
        messages,
        isLoading,
        isLoadingConversation,
        selectedModel,
        selectedModelRouteHint,
        sendMessage,
        handleModelChange,
        clearHistory,
        updateConversation,
        refresh: mutate,
    };
}
