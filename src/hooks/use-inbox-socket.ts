'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { useSession } from '@/lib/auth-client';

interface InboxSocketEvents {
    onNewMessage?: (data: { conversationId: string; message: unknown }) => void;
    onConversationUpdate?: (data: { conversation: unknown }) => void;
    onNewConversation?: (data: { conversation: unknown }) => void;
    onTyping?: (data: { conversationId: string; userId: string; isTyping: boolean }) => void;
    onMessageStatus?: (data: { conversationId: string; messageId: string; status: string }) => void;
}

/**
 * React hook for inbox real-time updates
 */
export function useInboxSocket(events: InboxSocketEvents = {}) {
    const { data: session } = useSession();
    const { socket } = useSocket();
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!socket) return;

        // Join inbox room
        socket.emit('inbox:join', { });
        setIsConnected(true);

        // Listen for new messages
        if (events.onNewMessage) {
            socket.on('inbox:message:new', events.onNewMessage);
        }

        // Listen for conversation updates
        if (events.onConversationUpdate) {
            socket.on('inbox:conversation:update', events.onConversationUpdate);
        }

        // Listen for new conversations
        if (events.onNewConversation) {
            socket.on('inbox:conversation:new', events.onNewConversation);
        }

        // Listen for typing indicators
        if (events.onTyping) {
            socket.on('inbox:typing', events.onTyping);
        }

        // Listen for message status updates
        if (events.onMessageStatus) {
            socket.on('inbox:message:status', events.onMessageStatus);
        }

        // Cleanup
        return () => {
            socket.emit('inbox:leave', { });
            socket.off('inbox:message:new');
            socket.off('inbox:conversation:update');
            socket.off('inbox:conversation:new');
            socket.off('inbox:typing');
            socket.off('inbox:message:status');
            setIsConnected(false);
        };
    }, [socket, session, events]);

    // Send typing indicator
    const sendTypingIndicator = useCallback(
        (conversationId: string, isTyping: boolean) => {
            if (!socket) return;

            socket.emit('inbox:typing:send', {
                conversationId,
                userId: (session!.user as { id?: string }).id,
                isTyping,
            });
        },
        [socket, session]
    );

    return {
        isConnected,
        sendTypingIndicator,
    };
}
