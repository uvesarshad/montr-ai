'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Inbox as InboxIcon,
  MessageSquare,
  AtSign,
  Heart,
  UserPlus,
  Mail,
  Send,
  Archive,
  CheckCheck,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { SocialEmptyState, SocialPanel } from '@/components/social/social-workspace';
import {
  Avatar,
  Button,
  Chip,
  Select,
  Spinner,
  Textarea,
  type ChipTone,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

interface Interaction {
  _id: string;
  brandId: string;
  platform: string;
  type: 'dm' | 'comment' | 'mention' | 'reaction' | 'follow';
  authorHandle: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  text?: string;
  permalink?: string;
  status: 'unread' | 'read' | 'archived';
  repliedAt?: string;
  occurredAt: string;
}

interface Brand {
  _id: string;
  name: string;
  handle?: string;
}

const TYPE_CONFIG: Record<Interaction['type'], { icon: LucideIcon; tone: ChipTone; label: string }> = {
  dm: { icon: Mail, tone: 'info', label: 'DM' },
  comment: { icon: MessageSquare, tone: 'gray', label: 'Comment' },
  mention: { icon: AtSign, tone: 'brand', label: 'Mention' },
  reaction: { icon: Heart, tone: 'danger', label: 'Reaction' },
  follow: { icon: UserPlus, tone: 'ok', label: 'Follow' },
};

// Platforms our reply path supports today.
const REPLY_SUPPORTED = new Set(['instagram', 'facebook', 'x']);

export default function SocialInboxPage() {
  const { toast } = useToast();

  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);

  // Brands -----------------------------------------------------------------
  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['social-brands'],
    queryFn: async () => {
      const res = await fetch('/api/social/brands');
      if (!res.ok) return [];
      const data = await res.json();
      return data.brands || [];
    },
  });

  useEffect(() => {
    if (!selectedBrandId && brands.length > 0) {
      setSelectedBrandId(brands[0]._id);
    }
  }, [brands, selectedBrandId]);

  // Inbox ------------------------------------------------------------------
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<{ interactions: Interaction[]; unreadCount: number }>({
    queryKey: ['social-inbox', selectedBrandId, statusFilter, platformFilter],
    enabled: !!selectedBrandId,
    queryFn: async () => {
      const params = new URLSearchParams({ brandId: selectedBrandId });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      const res = await fetch(`/api/social/inbox?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load inbox');
      return res.json();
    },
  });

  const interactions = useMemo(() => data?.interactions || [], [data]);
  const unreadCount = data?.unreadCount || 0;

  useEffect(() => {
    if (isError) {
      toast({ variant: 'destructive', title: 'Failed to load inbox' });
    }
  }, [isError, toast]);

  const selected = useMemo(
    () => interactions.find((i) => i._id === selectedId) || null,
    [interactions, selectedId],
  );

  // Auto-mark-read on open.
  const handleSelect = useCallback(
    async (interaction: Interaction) => {
      setSelectedId(interaction._id);
      setReplyText('');
      if (interaction.status === 'unread') {
        try {
          await fetch(`/api/social/inbox/${interaction._id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'read' }),
          });
          refetch();
        } catch {
          /* non-fatal */
        }
      }
    },
    [refetch],
  );

  const handleAction = useCallback(
    async (interactionId: string, action: 'read' | 'archive') => {
      setActing(true);
      try {
        const res = await fetch(`/api/social/inbox/${interactionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) throw new Error('Action failed');
        if (action === 'archive' && selectedId === interactionId) {
          setSelectedId(null);
        }
        await refetch();
      } catch {
        toast({ variant: 'destructive', title: 'Action failed' });
      } finally {
        setActing(false);
      }
    },
    [refetch, selectedId, toast],
  );

  const handleReply = useCallback(async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/social/inbox/${selected._id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || 'Failed to send reply');
      }
      toast({ title: 'Reply sent' });
      setReplyText('');
      await refetch();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to send reply',
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSending(false);
    }
  }, [selected, replyText, refetch, toast]);

  const platforms = useMemo(() => {
    const set = new Set(interactions.map((i) => i.platform));
    return Array.from(set);
  }, [interactions]);

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={selectedBrandId}
        onChange={setSelectedBrandId}
        triggerClassName="w-[180px]"
        aria-label="Brand"
        options={brands.map((b) => ({ value: b._id, label: b.name }))}
      />
      <Select
        value={statusFilter}
        onChange={setStatusFilter}
        triggerClassName="w-[150px]"
        aria-label="Status"
        options={[
          { value: 'all', label: 'All statuses' },
          { value: 'unread', label: 'Unread' },
          { value: 'read', label: 'Read' },
          { value: 'archived', label: 'Archived' },
        ]}
      />
      <Select
        value={platformFilter}
        onChange={setPlatformFilter}
        triggerClassName="w-[150px]"
        aria-label="Platform"
        options={[
          { value: 'all', label: 'All platforms' },
          ...platforms.map((p) => ({ value: p, label: p })),
        ]}
      />
    </div>
  );

  return (
    <ModuleShell
      title="Inbox"
      icon={InboxIcon}
      meta={`${unreadCount} unread`}
      filterBar={filterBar}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* List ------------------------------------------------------------ */}
        <SocialPanel
          title="Conversations"
          description={`${interactions.length} shown`}
          contentClassName="p-0"
        >
          {!selectedBrandId || isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size={28} />
            </div>
          ) : interactions.length === 0 ? (
            <SocialEmptyState
              icon={InboxIcon}
              title="No interactions"
              description="Comments, mentions, and DMs from your connected accounts will appear here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {interactions.map((it) => {
                const cfg = TYPE_CONFIG[it.type];
                const TypeIcon = cfg.icon;
                const isActive = it._id === selectedId;
                return (
                  <li key={it._id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(it)}
                      className={[
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                        isActive ? 'bg-muted/60' : '',
                        it.status === 'unread' ? 'font-medium' : '',
                      ].join(' ')}
                    >
                      <Avatar
                        name={it.authorDisplayName || it.authorHandle}
                        src={it.authorAvatarUrl}
                        size={36}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm">
                            {it.authorDisplayName || it.authorHandle}
                          </span>
                          {it.status === 'unread' ? (
                            <span className="size-2 shrink-0 rounded-full bg-brand" />
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {it.text || cfg.label}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <Chip tone={cfg.tone} className="gap-1 text-[10px]">
                            <TypeIcon className="size-3" />
                            {cfg.label}
                          </Chip>
                          <Chip tone="gray" className="text-[10px]">
                            {it.platform}
                          </Chip>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(it.occurredAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SocialPanel>

        {/* Detail ---------------------------------------------------------- */}
        <SocialPanel title="Conversation" description={selected ? selected.platform : 'Select an interaction'}>
          {!selected ? (
            <SocialEmptyState
              icon={MessageSquare}
              title="Nothing selected"
              description="Pick a conversation from the list to view it and reply."
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <Avatar
                  name={selected.authorDisplayName || selected.authorHandle}
                  src={selected.authorAvatarUrl}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {selected.authorDisplayName || selected.authorHandle}
                    </span>
                    <Chip tone={TYPE_CONFIG[selected.type].tone}>
                      {TYPE_CONFIG[selected.type].label}
                    </Chip>
                    {selected.repliedAt ? <Chip tone="ok">Replied</Chip> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    @{selected.authorHandle} ·{' '}
                    {formatDistanceToNow(new Date(selected.occurredAt), { addSuffix: true })}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
                {selected.text || <span className="italic text-muted-foreground">No text content</span>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={CheckCheck}
                  disabled={acting || selected.status === 'read'}
                  onClick={() => handleAction(selected._id, 'read')}
                >
                  Mark read
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={Archive}
                  disabled={acting || selected.status === 'archived'}
                  onClick={() => handleAction(selected._id, 'archive')}
                >
                  Archive
                </Button>
                {selected.permalink ? (
                  <Button size="sm" variant="ghost" icon={ExternalLink} asChild>
                    <a href={selected.permalink} target="_blank" rel="noopener noreferrer">
                      Open
                    </a>
                  </Button>
                ) : null}
              </div>

              {REPLY_SUPPORTED.has(selected.platform) ? (
                <div className="space-y-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply to @${selected.authorHandle}…`}
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="brand"
                      icon={Send}
                      disabled={sending || !replyText.trim()}
                      onClick={handleReply}
                    >
                      {sending ? 'Sending…' : 'Send reply'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Replying isn&apos;t supported for {selected.platform} yet.
                </p>
              )}
            </div>
          )}
        </SocialPanel>
      </div>
    </ModuleShell>
  );
}
