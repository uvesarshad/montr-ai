'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, ChevronRight, LayoutGrid, List, Mic, Plus } from 'lucide-react';

import { AIBotsShell } from '@/components/ai-bots/ai-bots-shell';
import { useAppHeader } from '@/components/app-header';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Meter,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_CHATBOT_MODEL } from '@/lib/inbox/chatbots';
import styles from './ai-bots.module.css';

interface ChatbotRecord {
  _id: string;
  name: string;
  isActive: boolean;
  config?: {
    aiModel?: string;
    knowledgeBaseIds?: string[];
    formIds?: string[];
    chatbotType?: string;
    primaryColor?: string;
  };
  metrics?: {
    totalConversations?: number;
  };
}

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'active' | 'draft';

function ChatbotGridCard({ chatbot }: { chatbot: ChatbotRecord }) {
  const docsCount = chatbot.config?.knowledgeBaseIds?.length || 0;
  const formsCount = chatbot.config?.formIds?.length || 0;
  const conversationsCount = chatbot.metrics?.totalConversations || 0;
  const accent = chatbot.config?.primaryColor || '#3B82F6';

  return (
    <Link href={`/ai-bots/${chatbot._id}`} className="block">
      <Card lift spotlight className="cursor-pointer">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]"
              style={{ backgroundColor: `${accent}1A`, color: accent }}
            >
              <Bot className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {chatbot.name}
            </span>
            <Chip
              tone={chatbot.isActive ? 'ok' : 'gray'}
              className="h-[19px] text-[10.5px]"
            >
              {chatbot.isActive ? 'Active' : 'Draft'}
            </Chip>
          </div>

          <div>
            <Chip tone="gray" className="capitalize">
              {chatbot.config?.chatbotType || 'support'}
            </Chip>
          </div>

          <div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-muted-foreground">Docs &amp; forms</span>
              <span className="font-mono font-semibold tabular-nums">
                {docsCount} docs · {formsCount} forms
              </span>
            </div>
            <Meter className="mt-1.5" value={Math.min(100, (docsCount + formsCount) * 10)} />
          </div>

          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">
              {conversationsCount} conversations
            </span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-brand-strong">
              Open
              <ChevronRight className="size-3.5" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function ChatbotListRow({ chatbot }: { chatbot: ChatbotRecord }) {
  const accent = chatbot.config?.primaryColor || '#3B82F6';
  return (
    <Link
      href={`/ai-bots/${chatbot._id}`}
      className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-muted/60"
    >
      <span
        className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]"
        style={{ backgroundColor: `${accent}1A`, color: accent }}
      >
        <Bot className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold">{chatbot.name}</div>
        <div className="truncate text-[12px] text-muted-foreground">
          {(chatbot.config?.chatbotType || 'support')} ·{' '}
          {chatbot.config?.aiModel || DEFAULT_CHATBOT_MODEL}
        </div>
      </div>
      <div className="hidden text-right text-[12px] text-muted-foreground sm:block">
        <div>{chatbot.metrics?.totalConversations || 0} conversations</div>
        <div className="mt-0.5">{chatbot.config?.knowledgeBaseIds?.length || 0} docs</div>
      </div>
      <Chip tone={chatbot.isActive ? 'ok' : 'gray'} className="h-[19px] text-[10.5px]">
        {chatbot.isActive ? 'Active' : 'Draft'}
      </Chip>
    </Link>
  );
}

function VoiceBotsCard() {
  return (
    <Card>
      <div className={styles.secondarySplit} style={{ padding: 16 }}>
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.015em]">Voice bots</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Voice stays staged here until the call runtime and live routing are ready.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Chip tone="gray">Planned</Chip>
            <span className="text-[12px] text-muted-foreground">0 voice bots live</span>
          </div>
          <Link href="/ai-bots/audio" className="mt-4 inline-block">
            <Button variant="outline" size="sm" icon={Mic}>
              Open voice bots
            </Button>
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          {[
            { title: 'Realtime transcript', desc: 'Live turns, interruptions, and transcript review' },
            { title: 'Call routing', desc: 'Queue handoff rules for support, sales, and after-hours' },
            { title: 'Shared sources', desc: 'Reuse docs, forms, and brand controls from website bots' },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-border bg-secondary px-3 py-2.5">
              <div className="text-[12.5px] font-semibold text-foreground">{item.title}</div>
              <div className="text-[13px] text-muted-foreground">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function ChatbotsPage() {
  const { setHeaderInfo } = useAppHeader();
  const { toast } = useToast();
  const [chatbots, setChatbots] = useState<ChatbotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchChatbots = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/inbox/chatbots');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load bots');
      }

      setChatbots(data.chatbots || []);
    } catch (error) {
      console.error('Error fetching chatbots:', error);
      toast({
        variant: 'destructive',
        title: "Couldn't load bots",
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchChatbots();
  }, [fetchChatbots]);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'AI bots',
      description: `${chatbots.length} website bots`,
      actions: (
        <Link href="/ai-bots/new">
          <Button variant="brand" icon={Plus}>
            New bot
          </Button>
        </Link>
      ),
    });

    return () => {
      setHeaderInfo(null);
    };
  }, [chatbots.length, setHeaderInfo]);

  const summaryStats = useMemo(() => {
    const activeCount = chatbots.filter((chatbot) => chatbot.isActive).length;
    const conversationCount = chatbots.reduce(
      (total, chatbot) => total + (chatbot.metrics?.totalConversations || 0),
      0,
    );
    const docsCount = chatbots.reduce(
      (total, chatbot) => total + (chatbot.config?.knowledgeBaseIds?.length || 0),
      0,
    );

    return [
      { label: 'Website bots', value: String(chatbots.length), tone: 'blue' as const },
      { label: 'Active', value: String(activeCount), tone: 'emerald' as const },
      { label: 'Docs', value: String(docsCount), tone: 'violet' as const },
      { label: 'Conversations', value: String(conversationCount), tone: 'amber' as const },
    ];
  }, [chatbots]);

  const filteredChatbots = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return chatbots.filter((chatbot) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? chatbot.isActive : !chatbot.isActive);
      const matchesQuery =
        !normalizedQuery ||
        chatbot.name.toLowerCase().includes(normalizedQuery) ||
        (chatbot.config?.chatbotType || '').toLowerCase().includes(normalizedQuery) ||
        (chatbot.config?.aiModel || DEFAULT_CHATBOT_MODEL).toLowerCase().includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [chatbots, query, statusFilter]);

  return (
    <AIBotsShell
      title="AI bots"
      description="Deploy website bots now and keep voice bots staged in the same workspace."
      badge="Bot workspace"
      stats={summaryStats}
    >
      <div className="flex flex-col gap-3">
        <Card>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold tracking-[-0.015em]">Website bots</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Manage bot status, sources, and embed setup from one library.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <SearchInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search bots…"
                  wrapClassName="w-[200px]"
                />
                <Select
                  aria-label="Status"
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                  options={[
                    { value: 'all', label: 'All status' },
                    { value: 'active', label: 'Active' },
                    { value: 'draft', label: 'Draft' },
                  ]}
                  triggerClassName="w-[130px]"
                />
                <Segmented
                  options={[
                    { value: 'grid', label: <LayoutGrid className="size-3.5" /> },
                    { value: 'list', label: <List className="size-3.5" /> },
                  ]}
                  value={viewMode}
                  onChange={(v) => setViewMode(v as ViewMode)}
                />
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => i).map((i) => (
                  <Skeleton key={i} className="h-[170px] rounded-lg" />
                ))}
              </div>
            ) : filteredChatbots.length === 0 ? (
              <EmptyState
                icon={Bot}
                title={chatbots.length === 0 ? 'No bots yet' : 'No bots match'}
                note={
                  chatbots.length === 0
                    ? 'Create a website bot, connect docs or forms, then add the script to your site.'
                    : 'Try a different search or status filter.'
                }
                cta={
                  chatbots.length === 0 ? (
                    <Link href="/ai-bots/new">
                      <Button variant="brand" icon={Plus}>
                        New bot
                      </Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredChatbots.map((chatbot) => (
                  <ChatbotGridCard key={chatbot._id} chatbot={chatbot} />
                ))}
                <Link
                  href="/ai-bots/new"
                  className="grid h-full min-h-[170px] w-full place-items-center rounded-2xl border border-dashed border-border bg-transparent text-muted-foreground transition hover:border-brand/40 hover:text-foreground"
                >
                  <span className="text-center">
                    <span className="mx-auto mb-2 grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-accent text-accent-foreground">
                      <Plus className="h-[18px] w-[18px]" />
                    </span>
                    <span className="block text-[13px] font-semibold">New bot</span>
                  </span>
                </Link>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {filteredChatbots.map((chatbot) => (
                  <ChatbotListRow key={chatbot._id} chatbot={chatbot} />
                ))}
              </div>
            )}
          </div>
        </Card>

        <VoiceBotsCard />
      </div>
    </AIBotsShell>
  );
}
