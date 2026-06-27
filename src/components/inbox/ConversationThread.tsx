'use client';

import NextImage from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { format } from 'date-fns';
import {
  ArrowUpRight,
  CheckCheck,
  Instagram,
  Mail,
  MessageCircleMore,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Avatar, Button, ChatBubble, Chip, Spinner } from '@/components/ui-kit';

import ConversationSidebar from './ConversationSidebar';
import MessageComposer from './MessageComposer';
import { InboxConversationRecord, InboxMessageRecord } from './types';

interface ConversationThreadProps {
  conversationId: string;
  onConversationChanged?: () => void;
}

const CHANNEL_ICON: Record<string, LucideIcon> = {
  whatsapp: MessageCircleMore,
  email: Mail,
  instagram: Instagram,
};

export default function ConversationThread({
  conversationId,
  onConversationChanged,
}: ConversationThreadProps) {
  const { data: session } = useSession();
  const [conversation, setConversation] = useState<InboxConversationRecord | null>(null);
  const [messages, setMessages] = useState<InboxMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingQuickAction, setSavingQuickAction] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const displayName = useMemo(() => {
    return (
      conversation?.contactId?.name ||
      conversation?.metadata?.phoneNumber ||
      conversation?.metadata?.email ||
      'Unknown contact'
    );
  }, [conversation]);

  async function fetchConversation() {
    try {
      setLoading(true);
      const response = await fetch(`/api/inbox/conversations/${conversationId}`);
      const data = await response.json();
      setConversation(data.conversation || null);
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Error fetching conversation:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage(payload: { content: string; isNote?: boolean }) {
    const response = await fetch('/api/inbox/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        content: payload.content,
        isNote: payload.isNote,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    await fetchConversation();
    onConversationChanged?.();
  }

  async function handleUpdateConversation(updates: Partial<InboxConversationRecord>) {
    const payload = { ...updates } as Record<string, unknown>;

    if (payload.assignedToId === 'me') {
      payload.assignedToId = session?.user?.id || null;
    }

    const response = await fetch(`/api/inbox/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Failed to update conversation');
    }

    await fetchConversation();
    onConversationChanged?.();
  }

  async function handleQuickAction(action: 'assignedToId' | 'status', value: string | null) {
    setSavingQuickAction(action);
    try {
      await handleUpdateConversation({ [action]: value } as Partial<InboxConversationRecord>);
    } finally {
      setSavingQuickAction(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm font-medium">Conversation unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This thread may have been deleted or moved out of your current view.
          </p>
        </div>
      </div>
    );
  }

  const channelType = conversation.channelId?.channelType ?? '';
  const ChannelIcon = CHANNEL_ICON[channelType] ?? MessageCircleMore;
  const channelName = conversation.channelId?.name || 'Channel';
  const replyPlaceholder = `Reply to ${displayName.split(' ')[0]} on ${channelName}…`;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* thread head */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Avatar name={displayName} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-semibold">{displayName}</div>
            <div className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
              <ChannelIcon className="size-3.5" />
              {channelName}
              {conversation.metadata?.phoneNumber ? <span>· {conversation.metadata.phoneNumber}</span> : null}
            </div>
          </div>
          <Chip tone={getStatusTone(conversation.status)} className="capitalize">
            {conversation.status}
          </Chip>
          <Button
            size="sm"
            variant="outline"
            icon={UserRound}
            disabled={savingQuickAction === 'assignedToId'}
            onClick={() => void handleQuickAction('assignedToId', conversation.assignedToId ? null : 'me')}
          >
            {conversation.assignedToId ? 'Unassign' : 'Assign me'}
          </Button>
          <Button
            size="sm"
            icon={CheckCheck}
            disabled={savingQuickAction === 'status' || conversation.status === 'resolved'}
            onClick={() => void handleQuickAction('status', 'resolved')}
          >
            Resolve
          </Button>
        </div>

        {/* thread body */}
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto bg-background px-5 py-5">
          {messages.map((message) => {
            const isOutbound = message.direction === 'outbound';
            const isNote = Boolean(message.isNote);

            if (isNote) {
              return (
                <div
                  key={message._id}
                  className="mx-auto w-full max-w-2xl rounded-xl border border-warning/40 bg-warning-muted/50 p-3.5 text-sm shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-warning-foreground">
                    <span>Internal note</span>
                    <span>{message.noteAuthorName || 'Agent'}</span>
                  </div>
                  <p className="mt-2.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">{message.content}</p>
                  <p className="mt-2.5 text-[11px] text-muted-foreground">
                    {format(new Date(message.createdAt), 'MMM d, h:mm a')}
                  </p>
                </div>
              );
            }

            return (
              <ChatBubble
                key={message._id}
                dir={isOutbound ? 'out' : 'in'}
                meta={
                  <span className="inline-flex items-center gap-1">
                    {format(new Date(message.createdAt), 'h:mm a')}
                    {isOutbound ? <span>· {message.status || 'sent'}</span> : null}
                  </span>
                }
              >
                {message.mediaUrl ? (
                  <div className="mb-2 overflow-hidden rounded-lg border border-border bg-muted">
                    {message.mediaType === 'image' ? (
                      <NextImage
                        src={message.mediaUrl}
                        alt="Message attachment"
                        width={0}
                        height={0}
                        sizes="100vw"
                        className="h-auto max-h-80 w-full object-cover"
                        unoptimized
                      />
                    ) : null}
                    {message.mediaType === 'video' ? <video src={message.mediaUrl} controls className="w-full" aria-label="Message video attachment" /> : null}
                    {message.mediaType === 'audio' ? <audio src={message.mediaUrl} controls className="w-full p-3" aria-label="Message audio attachment" /> : null}
                    {message.mediaType === 'document' ? (
                      <a
                        href={message.mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 p-3 text-sm"
                      >
                        <ArrowUpRight className="size-4" />
                        {message.fileName || 'Open document'}
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <span className="whitespace-pre-wrap">{message.content}</span>
              </ChatBubble>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <MessageComposer onSendMessage={handleSendMessage} replyPlaceholder={replyPlaceholder} />
      </div>

      <ConversationSidebar conversation={conversation} onUpdateConversation={handleUpdateConversation} />
    </div>
  );
}

function getStatusTone(status: InboxConversationRecord['status']) {
  switch (status) {
    case 'open':
      return 'ok' as const;
    case 'pending':
      return 'warn' as const;
    case 'resolved':
      return 'info' as const;
    default:
      return 'gray' as const;
  }
}
