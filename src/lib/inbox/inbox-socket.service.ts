import { Server as SocketIOServer, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { IInboxMessage } from '@/lib/db/models/inbox-message.model';
import { IInboxConversation } from '@/lib/db/models/inbox-conversation.model';

/**
 * Inbox Socket Service
 * Handles real-time events for inbox (new messages, conversation updates, typing indicators)
 */
export class InboxSocketService {
    private io: SocketIOServer;

    constructor(io: SocketIOServer) {
        this.io = io;
    }

    /**
     * Emit new message to organization members
     */
    emitNewMessage(params: {
        organizationId: Types.ObjectId;
        conversationId: Types.ObjectId;
        message: IInboxMessage | Record<string, unknown>;
    }) {
        const room = `org:${params.organizationId}:inbox`;
        this.io.to(room).emit('inbox:message:new', {
            conversationId: params.conversationId.toString(),
            message: params.message,
        });
    }

    /**
     * Emit conversation update (status, assignment, priority change)
     */
    emitConversationUpdate(params: {
        organizationId: Types.ObjectId;
        conversation: IInboxConversation | Record<string, unknown>;
    }) {
        const room = `org:${params.organizationId}:inbox`;
        this.io.to(room).emit('inbox:conversation:update', {
            conversation: params.conversation,
        });
    }

    /**
     * Emit new conversation created
     */
    emitNewConversation(params: {
        organizationId: Types.ObjectId;
        conversation: IInboxConversation | Record<string, unknown>;
    }) {
        const room = `org:${params.organizationId}:inbox`;
        this.io.to(room).emit('inbox:conversation:new', {
            conversation: params.conversation,
        });
    }

    /**
     * Emit typing indicator
     */
    emitTypingIndicator(params: {
        organizationId: Types.ObjectId;
        conversationId: Types.ObjectId;
        userId: Types.ObjectId;
        isTyping: boolean;
    }) {
        const room = `org:${params.organizationId}:inbox`;
        this.io.to(room).emit('inbox:typing', {
            conversationId: params.conversationId.toString(),
            userId: params.userId.toString(),
            isTyping: params.isTyping,
        });
    }

    /**
     * Emit message status update (delivered, read)
     */
    emitMessageStatusUpdate(params: {
        organizationId: Types.ObjectId;
        conversationId: Types.ObjectId;
        messageId: Types.ObjectId;
        status: string;
    }) {
        const room = `org:${params.organizationId}:inbox`;
        this.io.to(room).emit('inbox:message:status', {
            conversationId: params.conversationId.toString(),
            messageId: params.messageId.toString(),
            status: params.status,
        });
    }

    /**
     * Join inbox room for organization
     */
    joinInboxRoom(socket: Socket, organizationId: string) {
        const room = `org:${organizationId}:inbox`;
        socket.join(room);
        console.log(`Socket ${socket.id} joined inbox room: ${room}`);
    }

    /**
     * Leave inbox room
     */
    leaveInboxRoom(socket: Socket, organizationId: string) {
        const room = `org:${organizationId}:inbox`;
        socket.leave(room);
        console.log(`Socket ${socket.id} left inbox room: ${room}`);
    }
}

// Singleton instance (will be initialized in server.ts)
let inboxSocketService: InboxSocketService | null = null;

export const initializeInboxSocketService = (io: SocketIOServer) => {
    inboxSocketService = new InboxSocketService(io);
    return inboxSocketService;
};

export const getInboxSocketService = (): InboxSocketService => {
    if (!inboxSocketService) {
        throw new Error('InboxSocketService not initialized. Call initializeInboxSocketService first.');
    }
    return inboxSocketService;
};
