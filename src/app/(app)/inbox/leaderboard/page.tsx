'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Medal, RefreshCcw, Trophy } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Avatar, Button, Card, Select, StatCard, Table } from '@/components/ui-kit';
import { conversationRoutes } from '@/lib/navigation/module-routes';

interface LeaderboardEntry extends Record<string, unknown> {
  agentId: string;
  agentName?: string;
  agentEmail?: string;
  agentAvatar?: string;
  rank: number;
  score: number;
  totalConversations: number;
  resolutionRate: number;
  avgResponseTime: number | null;
  avgCSAT: number | null;
  csatCount: number;
}

export default function LeaderboardPage() {
    const router = useRouter();
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('30d');

    const fetchLeaderboard = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/inbox/leaderboard?period=${period}`);
            const data = await response.json();
            setLeaderboard(data.leaderboard || []);
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => {
        void fetchLeaderboard();
    }, [fetchLeaderboard]);

    const topAgents = useMemo(() => leaderboard.slice(0, 3), [leaderboard]);

    const periodSelector = (
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push(conversationRoutes.root)}>
                Back to conversations
            </Button>
            <Select
                value={period}
                onChange={setPeriod}
                aria-label="Period"
                triggerClassName="w-auto min-w-[140px]"
                options={[
                    { value: '7d', label: 'Last 7 days' },
                    { value: '30d', label: 'Last 30 days' },
                    { value: '90d', label: 'Last 90 days' },
                ]}
            />
            <Button variant="outline" size="sm" icon={RefreshCcw} onClick={() => void fetchLeaderboard()}>
                Refresh
            </Button>
        </div>
    );

    return (
        <ModuleShell
            title="Leaderboard"
            icon={Trophy}
            secondaryActions={periodSelector}
            isLoading={loading}
            contentClassName="flex flex-col gap-3 pb-8"
        >
            <div className="grid gap-3 xl:grid-cols-3">
                {topAgents.map((agent, index) => (
                    <Card key={agent.agentId} spotlight>
                        <div className="flex flex-col gap-5 p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Avatar name={agent.agentName || 'Agent'} src={agent.agentAvatar} size={48} />
                                    <div>
                                        <p className="text-sm font-semibold">{agent.agentName || 'Unknown'}</p>
                                        <p className="text-xs text-muted-foreground">{agent.agentEmail || 'No email'}</p>
                                    </div>
                                </div>
                                <span className="grid size-10 place-items-center rounded-lg bg-brand-muted text-brand-strong">
                                    {index === 0 ? <Trophy className="size-5" /> : <Medal className="size-5" />}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <StatCard label="Score" value={agent.score.toFixed(1)} />
                                <StatCard label="Resolution" value={`${agent.resolutionRate.toFixed(1)}%`} />
                                <StatCard label="Avg response" value={agent.avgResponseTime ? `${Math.round(agent.avgResponseTime / 60)}m` : 'N/A'} />
                                <StatCard label="CSAT" value={agent.avgCSAT ? agent.avgCSAT.toFixed(1) : 'N/A'} />
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <Card title="Full ranking" meta="Weighted by resolution, CSAT, speed, and volume">
                <Table<LeaderboardEntry>
                    rowKey="agentId"
                    columns={[
                        { key: 'rank', label: 'Rank', mono: true, render: (_v, a) => `#${a.rank}` },
                        {
                            key: 'agentName',
                            label: 'Agent',
                            render: (_value, agent) => (
                                <div className="flex items-center gap-3 py-1">
                                    <Avatar name={agent.agentName || 'Agent'} src={agent.agentAvatar} size={36} />
                                    <div>
                                        <p className="font-medium">{agent.agentName || 'Unknown'}</p>
                                        <p className="text-xs text-muted-foreground">{agent.agentEmail || 'No email'}</p>
                                    </div>
                                </div>
                            ),
                        },
                        { key: 'score', label: 'Score', align: 'right', mono: true, render: (_v, a) => a.score.toFixed(1) },
                        { key: 'totalConversations', label: 'Conversations', align: 'right', mono: true },
                        { key: 'resolutionRate', label: 'Resolution', align: 'right', mono: true, render: (_v, a) => `${a.resolutionRate.toFixed(1)}%` },
                        {
                            key: 'avgResponseTime',
                            label: 'Avg response',
                            align: 'right',
                            mono: true,
                            render: (_v, a) => (a.avgResponseTime ? `${Math.round(a.avgResponseTime / 60)}m` : 'N/A'),
                        },
                        {
                            key: 'avgCSAT',
                            label: 'CSAT',
                            align: 'right',
                            mono: true,
                            render: (_v, a) =>
                                a.avgCSAT ? `${a.avgCSAT.toFixed(1)}${a.csatCount ? ` (${a.csatCount})` : ''}` : 'N/A',
                        },
                    ]}
                    rows={leaderboard}
                />
            </Card>
        </ModuleShell>
    );
}

