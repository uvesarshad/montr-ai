'use client';

import { formatDistanceToNow } from 'date-fns';
import { Inbox, Instagram, Mail, MessageCircleMore, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ConversationItem, EmptyState, IconButton, SearchInput, Select, Skeleton } from '@/components/ui-kit';

import { InboxChannelSummary, InboxConversationRecord } from './types';

interface ConversationListProps {
  conversations: InboxConversationRecord[];
  channels: InboxChannelSummary[];
  totalCount: number;
  loading: boolean;
  searchQuery: string;
  channelFilter: string;
  statusFilter: string;
  assigneeFilter: string;
  selectedConversationId: string | null;
  onSearchQueryChange: (value: string) => void;
  onChannelFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onAssigneeFilterChange: (value: string) => void;
  onSelectConversation: (id: string) => void;
  onRefresh: () => void;
}

/** Channel type → icon + accent tint for the ConversationItem badge. */
const CHANNEL_META: Record<string, { icon: LucideIcon; color: string; tint: string }> = {
  whatsapp: { icon: MessageCircleMore, color: '#25d366', tint: 'hsl(var(--success-muted))' },
  email: { icon: Mail, color: '#3b82f6', tint: 'hsl(var(--info-muted))' },
  instagram: { icon: Instagram, color: '#d6249f', tint: 'hsl(var(--brand-muted))' },
};

function channelMeta(channelType?: string) {
  return CHANNEL_META[channelType ?? ''] ?? { icon: MessageCircleMore, color: 'hsl(var(--muted-foreground))', tint: 'hsl(var(--muted))' };
}

export default function ConversationList({
  conversations,
  channels,
  totalCount,
  loading,
  searchQuery,
  channelFilter,
  statusFilter,
  assigneeFilter,
  selectedConversationId,
  onSearchQueryChange,
  onChannelFilterChange,
  onStatusFilterChange,
  onAssigneeFilterChange,
  onSelectConversation,
  onRefresh,
}: ConversationListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* head — title + refresh */}
      <div className="border-b border-border px-4 pb-3 pt-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold">Inbox</span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">{totalCount}</span>
            <IconButton icon={RefreshCw} iconSize={15} onClick={onRefresh} aria-label="Refresh" className="size-7" />
          </span>
        </div>

        <SearchInput
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search by phone, email, or subject"
        />
      </div>

      {/* filters — channel + status + assignee; equal thirds so the row
          never overflows the 322px pane */}
      <div className="grid grid-cols-3 items-center gap-2 border-b border-border px-3 py-2.5">
        <Select
          value={channelFilter}
          onChange={onChannelFilterChange}
          aria-label="Channel"
          triggerClassName="h-7 w-full"
          options={[
            { value: 'all', label: 'All channels', icon: Inbox },
            ...channels.map((channel) => ({ value: channel._id, label: channel.name })),
          ]}
        />
        <Select
          value={statusFilter}
          onChange={onStatusFilterChange}
          aria-label="Status"
          triggerClassName="h-7 w-full"
          options={[
            { value: 'all', label: 'Any status' },
            { value: 'open', label: 'Open' },
            { value: 'pending', label: 'Pending' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
        <Select
          value={assigneeFilter}
          onChange={onAssigneeFilterChange}
          aria-label="Owner"
          triggerClassName="h-7 w-full"
          options={[
            { value: 'all', label: 'All owners' },
            { value: 'me', label: 'Assigned to me' },
            { value: 'unassigned', label: 'Unassigned' },
          ]}
        />
      </div>

      {/* list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-3 p-3.5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="size-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No conversations found"
            note="Try widening your filters or clearing the current search query."
          />
        ) : (
          conversations.map((conversation) => {
            const meta = channelMeta(conversation.channelId?.channelType);
            const displayName =
              conversation.contactId?.name ||
              conversation.metadata?.phoneNumber ||
              conversation.metadata?.email ||
              'Unknown contact';
            const preview =
              conversation.metadata?.subject ||
              conversation.channelId?.name ||
              `${conversation.totalMessages} message${conversation.totalMessages === 1 ? '' : 's'}`;
            const company = conversation.assignedToId?.name
              ? `Assigned · ${conversation.assignedToId.name}`
              : 'Unassigned';
            const time = conversation.lastMessageAt
              ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: false })
              : 'New';

            return (
              <ConversationItem
                key={conversation._id}
                active={selectedConversationId === conversation._id}
                onClick={() => onSelectConversation(conversation._id)}
                c={{
                  name: displayName,
                  company,
                  preview,
                  time,
                  channel: { icon: meta.icon, color: meta.color, tint: meta.tint },
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
