import useSWR from 'swr';
import { useCallback } from 'react';

interface ConversationListItem {
    _id: string;
    title: string;
    lastMessage?: string;
    lastModel?: string;
    isArchived: boolean;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
    type?: 'text' | 'image' | 'video' | 'audio' | 'character';
}

interface UseConversationsOptions {
    search?: string;
    archived?: boolean;
    type?: 'text' | 'image' | 'video' | 'audio' | 'character';
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useConversations(options: UseConversationsOptions = {}) {
    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.archived !== undefined) params.set('archived', String(options.archived));
    if (options.type) params.set('type', options.type);

    const queryString = params.toString();
    const url = `/api/v2/conversations${queryString ? `?${queryString}` : ''}`;

    const { data, error, isLoading, mutate } = useSWR<{ conversations: ConversationListItem[]; count: number }>(
        url,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 2000,
        }
    );

    const createConversation = useCallback(
        async (data?: { title?: string; messages?: Array<{ role: string; content: string }>; lastModel?: string; lastModelRouteHint?: object; type?: string }) => {
            const response = await fetch('/api/v2/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, type: options.type || data?.type || 'text' }),
            });

            if (!response.ok) {
                throw new Error('Failed to create conversation');
            }

            const newConversation = await response.json();
            mutate();
            return newConversation;
        },
        [mutate, options.type]
    );

    const updateConversation = useCallback(
        async (id: string, data: { title?: string; isArchived?: boolean }) => {
            const response = await fetch(`/api/v2/conversations/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error('Failed to update conversation');
            }

            const updated = await response.json();
            mutate();
            return updated;
        },
        [mutate]
    );

    const deleteConversation = useCallback(
        async (id: string) => {
            const response = await fetch(`/api/v2/conversations/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Failed to delete conversation');
            }

            mutate();
        },
        [mutate]
    );

    const duplicateConversation = useCallback(
        async (id: string) => {
            const response = await fetch(`/api/v2/conversations/${id}/duplicate`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Failed to duplicate conversation');
            }

            const duplicated = await response.json();
            mutate();
            return duplicated;
        },
        [mutate]
    );

    return {
        conversations: data?.conversations || [],
        count: data?.count || 0,
        isLoading,
        error,
        createConversation,
        updateConversation,
        deleteConversation,
        duplicateConversation,
        refresh: mutate,
    };
}
