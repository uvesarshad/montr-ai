'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { formatDistanceToNow } from 'date-fns';
import { Bot, MessageCircle, User } from 'lucide-react';

import { Avatar, Button, Chip, EmptyState, Segmented, Spinner } from '@/components/ui-kit';

interface ConversationPreview {
  _id: string;
  status: 'open' | 'resolved' | 'closed';
  totalMessages: number;
  lastMessageAt?: string;
  createdAt: string;
  metadata?: { visitorName?: string; visitorEmail?: string; sessionId?: string };
  lastMessage?: { content: string; direction: 'inbound' | 'outbound' };
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function BotConversationsTab({ botId }: { botId: string }) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useSWR<{
    data: ConversationPreview[];
    pagination: { total: number; totalPages: number; hasMore: boolean };
  }>(
    `/api/v2/ai-bots/${botId}/conversations?page=${page}&limit=25${statusFilter ? `&status=${statusFilter}` : ''}`,
    fetcher,
  );

  const conversations = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Segmented
          options={[
            { value: '', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'resolved', label: 'Resolved' },
          ]}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        />
        {pagination ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {pagination.total} conversation{pagination.total !== 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner size={24} />
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          note="Conversations with this bot will show up here once visitors start chatting."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {conversations.map((conv) => (
            <div
              key={conv._id}
              className="flex items-start gap-3 border-b border-border px-4 py-3.5 last:border-0"
            >
              <Avatar
                name={conv.metadata?.visitorName || conv.metadata?.visitorEmail || 'Anonymous'}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {conv.metadata?.visitorName || conv.metadata?.visitorEmail || 'Anonymous visitor'}
                  </span>
                  <Chip tone={conv.status === 'open' ? 'ok' : 'gray'} className="h-[18px] text-[10px] capitalize">
                    {conv.status}
                  </Chip>
                </div>
                {conv.lastMessage ? (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {conv.lastMessage.direction === 'outbound' ? (
                      <Bot className="size-3 shrink-0" />
                    ) : (
                      <User className="size-3 shrink-0" />
                    )}
                    <span className="truncate">{conv.lastMessage.content}</span>
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs text-muted-foreground">
                  {conv.lastMessageAt
                    ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })
                    : formatDistanceToNow(new Date(conv.createdAt), { addSuffix: true })}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground/70">
                  {conv.totalMessages} msg{conv.totalMessages !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!pagination.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
