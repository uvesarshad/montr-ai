'use client';

import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { MessagesSquare, RefreshCw } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import ConversationList from '@/components/inbox/ConversationList';
import ConversationThread from '@/components/inbox/ConversationThread';
import { InboxChannelSummary, InboxConversationRecord } from '@/components/inbox/types';
import { EmptyState, IconButton } from '@/components/ui-kit';
import { openAgentLauncher } from '@/lib/agent/launcher';

export default function InboxPage() {
    const { data: session } = useSession();
    const [channels, setChannels] = useState<InboxChannelSummary[]>([]);
    const [conversations, setConversations] = useState<InboxConversationRecord[]>([]);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [channelFilter, setChannelFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('open');
    const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const deferredSearchQuery = useDeferredValue(searchQuery);

    const fetchChannels = useCallback(async () => {
        try {
            const response = await fetch('/api/v2/crm/inbox/channels');
            const data = await response.json();
            setChannels(data.channels || []);
        } catch (error) {
            console.error('Error fetching channels:', error);
        }
    }, []);

    const fetchConversations = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();

            if (channelFilter !== 'all') params.set('channelId', channelFilter);
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (assigneeFilter === 'me' && session?.user?.id) {
                params.set('assignedToId', session.user.id);
            } else if (assigneeFilter === 'unassigned') {
                params.set('assignedToId', 'unassigned');
            }
            if (deferredSearchQuery.trim()) {
                params.set('search', deferredSearchQuery.trim());
            }

            const response = await fetch(`/api/inbox/conversations?${params.toString()}`);
            const data = await response.json();
            setConversations(data.conversations || []);
            setTotalCount(data.total || 0);
        } catch (error) {
            console.error('Error fetching conversations:', error);
        } finally {
            setLoading(false);
        }
    }, [assigneeFilter, channelFilter, deferredSearchQuery, session?.user?.id, statusFilter]);

    useEffect(() => {
        if (!session) {
            return;
        }

        void fetchChannels();
    }, [fetchChannels, session]);

    useEffect(() => {
        if (!session) {
            return;
        }

        void fetchConversations();
    }, [fetchConversations, session]);

    useEffect(() => {
        if (!conversations.length) {
            setSelectedConversationId(null);
            return;
        }

        const stillVisible = conversations.some((conversation) => conversation._id === selectedConversationId);
        if (!stillVisible) {
            setSelectedConversationId(conversations[0]._id);
        }
    }, [conversations, selectedConversationId]);

    const handleAskAgent = useCallback(() => {
        const selected = conversations.find((c) => c._id === selectedConversationId);
        const prompt = selected
            ? `Help me respond to this conversation: "${selected.metadata?.subject || selected._id}". Suggest a helpful reply.`
            : 'Review my open conversations and suggest prioritization or reply strategies.';
        openAgentLauncher({
            prompt,
            context: {
                source: 'inbox_conversations',
                entityType: 'conversation_list',
                entityLabel: 'Conversations',
                route: '/inbox',
            },
        });
    }, [conversations, selectedConversationId]);

    if (!session) {
        return (
            <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
                <p className="text-sm text-muted-foreground">Please sign in to access the inbox.</p>
            </div>
        );
    }

    return (
        <ModuleShell
            title="Conversations"
            icon={MessagesSquare}
            meta={`${totalCount} in view`}
            onAskAI={handleAskAgent}
            askAILabel="Ask Agent"
            secondaryActions={
                <IconButton
                    icon={RefreshCw}
                    iconSize={16}
                    onClick={() => void fetchConversations()}
                    aria-label="Refresh"
                />
            }
            contentClassName="min-h-0 flex-1 pb-3"
        >
            <div className="grid h-[calc(100vh-12rem)] min-h-[600px] grid-cols-[322px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card">
                <div className="min-h-0 border-r border-border">
                    <ConversationList
                        conversations={conversations}
                        channels={channels}
                        totalCount={totalCount}
                        loading={loading}
                        searchQuery={searchQuery}
                        channelFilter={channelFilter}
                        statusFilter={statusFilter}
                        assigneeFilter={assigneeFilter}
                        selectedConversationId={selectedConversationId}
                        onSearchQueryChange={setSearchQuery}
                        onChannelFilterChange={setChannelFilter}
                        onStatusFilterChange={setStatusFilter}
                        onAssigneeFilterChange={setAssigneeFilter}
                        onSelectConversation={setSelectedConversationId}
                        onRefresh={() => void fetchConversations()}
                    />
                </div>

                <div className="min-h-0 min-w-0">
                    {selectedConversationId ? (
                        <ConversationThread
                            conversationId={selectedConversationId}
                            onConversationChanged={() => void fetchConversations()}
                        />
                    ) : (
                        <EmptyState
                            icon={MessagesSquare}
                            title="Select a conversation"
                            note="The workspace shows the full history, quick actions, ownership, and internal notes for the selected conversation."
                            className="h-full"
                        />
                    )}
                </div>
            </div>
        </ModuleShell>
    );
}
