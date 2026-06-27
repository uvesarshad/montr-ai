'use client';

import { useEffect, useState } from 'react';
import {
  Mail,
  Phone,
  Save,
  UserRound,
} from 'lucide-react';

import {
  Avatar,
  Button,
  Card,
  Chip,
  Field,
  Select,
  StatCard,
  Textarea,
} from '@/components/ui-kit';

import { InboxConversationRecord } from './types';

interface ConversationSidebarProps {
  conversation: InboxConversationRecord;
  onUpdateConversation: (updates: Partial<InboxConversationRecord>) => Promise<void> | void;
}

export default function ConversationSidebar({
  conversation,
  onUpdateConversation,
}: ConversationSidebarProps) {
  const [notes, setNotes] = useState(conversation.internalNotes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setNotes(conversation.internalNotes || '');
  }, [conversation.internalNotes, conversation._id]);

  const displayName =
    conversation.contactId?.name ||
    conversation.metadata?.phoneNumber ||
    conversation.metadata?.email ||
    'Unknown contact';

  return (
    <aside className="hidden w-[312px] shrink-0 flex-col border-l border-border bg-background xl:flex">
      <div className="flex h-[54px] shrink-0 items-center gap-2 border-b border-border px-4">
        <UserRound className="size-3.5 text-brand-strong" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Contact
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
        {/* contact card */}
        <Card>
          <div className="flex flex-col items-center gap-1 px-4 py-4 text-center">
            <Avatar name={displayName} size={52} />
            <div className="mt-1.5 text-[15px] font-semibold">{displayName}</div>
            <div className="text-[12.5px] text-muted-foreground">
              {conversation.channelId?.name || 'Connected channel'}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
              {conversation.metadata?.email ? (
                <Button size="sm" variant="outline" icon={Mail}>
                  Email
                </Button>
              ) : null}
              {conversation.metadata?.phoneNumber ? (
                <Button size="sm" variant="outline" icon={Phone}>
                  Call
                </Button>
              ) : null}
            </div>
            {conversation.metadata?.phoneNumber || conversation.metadata?.email ? (
              <div className="mt-2.5 flex w-full flex-col gap-1.5 text-[12.5px] text-muted-foreground">
                {conversation.metadata?.phoneNumber ? (
                  <div className="flex items-center gap-2">
                    <Phone className="size-3.5" />
                    <span>{conversation.metadata.phoneNumber}</span>
                  </div>
                ) : null}
                {conversation.metadata?.email ? (
                  <div className="flex items-center gap-2">
                    <Mail className="size-3.5" />
                    <span className="truncate">{conversation.metadata.email}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>

        {/* status + priority */}
        <Card title="Conversation">
          <div className="flex flex-col gap-3 px-4 pb-4">
            <Field label="Status" htmlFor="conv-status">
              <Select
                value={conversation.status}
                onChange={(value) => onUpdateConversation({ status: value as InboxConversationRecord['status'] })}
                aria-label="Status"
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'resolved', label: 'Resolved' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
            </Field>
            <Field label="Priority" htmlFor="conv-priority">
              <Select
                value={conversation.priority}
                onChange={(value) => onUpdateConversation({ priority: value as InboxConversationRecord['priority'] })}
                aria-label="Priority"
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
            </Field>
          </div>
        </Card>

        {/* ownership */}
        <Card title="Ownership">
          <div className="flex items-center justify-between gap-3 px-4 pb-4">
            <span className="text-[13.5px] font-medium">
              {conversation.assignedToId?.name || 'Unassigned'}
            </span>
            <div className="flex gap-1.5">
              {conversation.assignedToId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUpdateConversation({ assignedToId: null })}
                >
                  Unassign
                </Button>
              ) : null}
              <Button
                size="sm"
                icon={UserRound}
                onClick={() =>
                  onUpdateConversation({
                    assignedToId: 'me' as unknown as InboxConversationRecord['assignedToId'],
                  })
                }
              >
                Assign me
              </Button>
            </div>
          </div>
        </Card>

        {/* response metrics */}
        <Card title="Response metrics">
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            <StatCard label="Messages" value={String(conversation.totalMessages || 0)} />
            <StatCard label="Avg reply" value={formatMinutes(conversation.averageResponseTime)} />
            <StatCard label="First reply" value={formatMinutes(conversation.firstResponseTime)} />
            <StatCard
              label="CSAT"
              value={typeof conversation.csatRating === 'number' ? conversation.csatRating.toFixed(1) : 'N/A'}
            />
          </div>
        </Card>

        {/* labels */}
        {conversation.labels?.length ? (
          <Card title="Tags">
            <div className="flex flex-wrap gap-1.5 px-4 pb-4">
              {conversation.labels.map((label) => (
                <Chip key={label} tone="gray">
                  {label}
                </Chip>
              ))}
            </div>
          </Card>
        ) : null}

        {/* internal notes */}
        <Card
          title="Internal notes"
          action={
            <Button
              size="sm"
              variant="outline"
              icon={Save}
              disabled={savingNotes || notes === (conversation.internalNotes || '')}
              onClick={async () => {
                setSavingNotes(true);
                try {
                  await onUpdateConversation({ internalNotes: notes });
                } finally {
                  setSavingNotes(false);
                }
              }}
            >
              Save
            </Button>
          }
        >
          <div className="px-4 pb-4">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={6}
              placeholder="Capture commitments, context, and handoff details…"
            />
          </div>
        </Card>
      </div>
    </aside>
  );
}

function formatMinutes(seconds?: number) {
  if (!seconds) {
    return 'N/A';
  }

  return `${Math.round(seconds / 60)}m`;
}
