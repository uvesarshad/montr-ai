/**
 * WebSocket Server for Real-time Workflow Updates
 *
 * Provides real-time execution updates to clients watching workflow executions.
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import mongoose from 'mongoose';
import { isAuthorizedChatbotOrigin } from '@/lib/inbox/chatbot-origin';
import { inboxService } from '@/lib/inbox/inbox.service';
import { generateChatbotReply } from '@/lib/inbox/chatbot-ai-reply';
import { initializeInboxSocketService } from '@/lib/inbox/inbox-socket.service';
import { subscribeWorkflowEvents } from '@/lib/workflow/events/bus';
import { subscribeNotificationEvents } from '@/lib/notifications/notification-bus';
import { initNotificationDispatcher } from '@/lib/notifications/notification-dispatcher';

let io: SocketIOServer | null = null;

/** Minimal shape of a workflow execution document passed to socket emit helpers */
interface ExecutionDoc {
    _id: string | { toString(): string };
    [key: string]: unknown;
}

/** Shape of an execution step passed to emitExecutionStep */
interface ExecutionStep {
    nodeId: string;
    [key: string]: unknown;
}

export function initializeSocket(server: HTTPServer): SocketIOServer {
  if (io) {
    return io;
  }

  io = new SocketIOServer(server, {
    path: '/api/socket',
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);

    // Join a workflow room to receive updates for specific workflows
    socket.on('join:workflow', (workflowId: string) => {
      socket.join(`workflow:${workflowId}`);
      console.log(`[Socket] Client ${socket.id} joined workflow:${workflowId}`);
    });

    // Leave a workflow room
    socket.on('leave:workflow', (workflowId: string) => {
      socket.leave(`workflow:${workflowId}`);
      console.log(`[Socket] Client ${socket.id} left workflow:${workflowId}`);
    });

    // Join an execution room to receive updates for specific executions
    socket.on('join:execution', (executionId: string) => {
      socket.join(`execution:${executionId}`);
      console.log(`[Socket] Client ${socket.id} joined execution:${executionId}`);
    });

    // Leave an execution room
    socket.on('leave:execution', (executionId: string) => {
      socket.leave(`execution:${executionId}`);
      console.log(`[Socket] Client ${socket.id} left execution:${executionId}`);
    });

    // Inbox: Join organization inbox room
    socket.on('inbox:join', (data: { organizationId: string }) => {
      const room = `org:${data.organizationId}:inbox`;
      socket.join(room);
      console.log(`[Socket] Client ${socket.id} joined ${room}`);
    });

    // Inbox: Leave organization inbox room
    socket.on('inbox:leave', (data: { organizationId: string }) => {
      const room = `org:${data.organizationId}:inbox`;
      socket.leave(room);
      console.log(`[Socket] Client ${socket.id} left ${room}`);
    });

    // Notifications: join/leave a per-user room.
    socket.on('notifications:join', (userId: string) => {
      if (typeof userId !== 'string' || !userId) return;
      socket.join(`user:${userId}`);
    });
    socket.on('notifications:leave', (userId: string) => {
      if (typeof userId !== 'string' || !userId) return;
      socket.leave(`user:${userId}`);
    });

    // Inbox: Typing indicator
    socket.on('inbox:typing:send', (data: { organizationId: string; conversationId: string; userId: string; isTyping: boolean }) => {
      const room = `org:${data.organizationId}:inbox`;
      socket.to(room).emit('inbox:typing', {
        conversationId: data.conversationId,
        userId: data.userId,
        isTyping: data.isTyping,
      });
    });

    // Chatbot Widget Domain validation & connection
    socket.on('chatbot:join', async (data: { sessionId: string; widgetToken: string }) => {
       try {
           const InboxChannel = mongoose.model('InboxChannel');

           const channel = await InboxChannel.findOne({
               channelType: 'website',
               $or: [
                   { 'config.widgetToken': data.widgetToken },
                   { 'config.stagingWidgetToken': data.widgetToken },
               ],
           });

           if (!channel) return socket.disconnect();

           // Domain whitelist check (supports multi-domain)
           const origin = socket.handshake.headers.origin;
           const referer = socket.handshake.headers.referer;
           if (!isAuthorizedChatbotOrigin({
               websiteUrl: channel.config.websiteUrl,
               websiteUrls: channel.config.websiteUrls,
               origin,
               referer,
           })) {
               console.error('[Socket] Blocked chatbot connection from unauthorized domain');
               return socket.disconnect();
           }

           const room = `chatbot:${data.sessionId}`;
           socket.join(room);
           console.log(`[Socket] Chatbot connected to ${room}`);
       } catch (error) {
           console.error('[Socket] Chatbot join error:', error);
       }
    });

    socket.on('chatbot:message', async (data: { sessionId: string; widgetToken: string; content: string }) => {
        try {
            const InboxChannel = mongoose.model('InboxChannel');

            const channel = await InboxChannel.findOne({
                $or: [
                    { 'config.widgetToken': data.widgetToken },
                    { 'config.stagingWidgetToken': data.widgetToken },
                ],
            });
            if (!channel) return;

            const { conversation } = await inboxService.receiveMessage({
                channelId: channel._id,
                payload: { sessionId: data.sessionId, content: data.content, messageType: 'text' },
            });

            // Generate AI reply
            const { text: aiReply, handoff } = await generateChatbotReply({
                channel,
                userMessage: data.content,
                conversationId: conversation?._id?.toString(),
            });

            // Persist outbound message
            if (conversation) {
                await inboxService.createMessage({
                    conversationId: conversation._id,
                    channelId: channel._id,
                    contactId: conversation.contactId,
                    direction: 'outbound',
                    messageType: 'text',
                    content: aiReply,
                    status: 'sent',
                    metadata: { isAiReply: true, handoff },
                });
            }

            socket.emit('chatbot:message', { content: aiReply, handoff });
        } catch(error) {
            console.error('[Socket] Chatbot message error:', error);
            socket.emit('chatbot:message', {
                content: "I'm having trouble responding right now. Please try again in a moment.",
                handoff: false,
            });
        }
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Client disconnected:', socket.id);
    });
  });

  // Initialize inbox socket service
  initializeInboxSocketService(io);

  // Bridge worker-process engine events into Socket.IO via Redis pub/sub.
  // Safe no-op when Redis isn't configured (dev without a queue).
  try {
    subscribeWorkflowEvents(io);
  } catch (err: unknown) {
    console.error('[Socket] Failed to subscribe workflow events:', err instanceof Error ? err.message : err);
  }

  // Notification socket bridge + domain-event dispatcher.
  try {
    subscribeNotificationEvents(io);
    initNotificationDispatcher();
  } catch (err: unknown) {
    console.error('[Socket] Failed to init notifications:', err instanceof Error ? err.message : err);
  }

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Emit execution started event
 */
export function emitExecutionStarted(workflowId: string, execution: ExecutionDoc) {
  if (!io) return;

  io.to(`workflow:${workflowId}`).emit('execution:started', {
    workflowId,
    executionId: execution._id,
    execution,
  });

  console.log(`[Socket] Emitted execution:started for workflow:${workflowId}`);
}

/**
 * Emit execution step event (node execution)
 */
export function emitExecutionStep(workflowId: string, executionId: string, step: ExecutionStep) {
  if (!io) return;

  io.to(`workflow:${workflowId}`).emit('execution:step', {
    workflowId,
    executionId,
    step,
  });

  io.to(`execution:${executionId}`).emit('execution:step', {
    workflowId,
    executionId,
    step,
  });

  console.log(`[Socket] Emitted execution:step for execution:${executionId}, node:${step.nodeId}`);
}

/**
 * Emit execution completed event
 */
export function emitExecutionCompleted(workflowId: string, execution: ExecutionDoc) {
  if (!io) return;

  io.to(`workflow:${workflowId}`).emit('execution:completed', {
    workflowId,
    executionId: execution._id,
    execution,
  });

  io.to(`execution:${execution._id}`).emit('execution:completed', {
    workflowId,
    executionId: execution._id,
    execution,
  });

  console.log(`[Socket] Emitted execution:completed for workflow:${workflowId}`);
}

/**
 * Emit execution failed event
 */
export function emitExecutionFailed(workflowId: string, execution: ExecutionDoc) {
  if (!io) return;

  io.to(`workflow:${workflowId}`).emit('execution:failed', {
    workflowId,
    executionId: execution._id,
    execution,
  });

  io.to(`execution:${execution._id}`).emit('execution:failed', {
    workflowId,
    executionId: execution._id,
    execution,
  });

  console.log(`[Socket] Emitted execution:failed for workflow:${workflowId}`);
}

/**
 * Emit execution status update event
 */
export function emitExecutionStatusUpdate(
  workflowId: string,
  executionId: string,
  status: string,
  data?: Record<string, unknown>
) {
  if (!io) return;

  io.to(`workflow:${workflowId}`).emit('execution:status', {
    workflowId,
    executionId,
    status,
    data,
  });

  io.to(`execution:${executionId}`).emit('execution:status', {
    workflowId,
    executionId,
    status,
    data,
  });

  console.log(`[Socket] Emitted execution:status for execution:${executionId}, status:${status}`);
}
