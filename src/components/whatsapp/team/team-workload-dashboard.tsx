'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Users, UserCheck, Clock, AlertCircle } from 'lucide-react';
import { Card, Chip, EmptyState, KpiTile, type ChipTone } from '@/components/ui-kit';

interface AgentWorkload {
  agentId: string;
  agentName: string;
  totalConversations: number;
  openConversations: number;
  pendingConversations: number;
  averageResponseTime: number;
}

export function TeamWorkloadDashboard() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentWorkload[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);

  const fetchWorkload = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/whatsapp/team/workload');
      const data = await response.json();

      if (response.ok) {
        setAgents(data.data.agents || []);
        setUnassignedCount(data.data.unassignedCount || 0);
      }
    } catch (error) {
      console.error('Error fetching workload:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkload();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchWorkload, 30000);
    return () => clearInterval(interval);
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getWorkloadLevel = (count: number): 'low' | 'medium' | 'high' => {
    if (count <= 5) return 'low';
    if (count <= 15) return 'medium';
    return 'high';
  };

  const getWorkloadTone = (level: 'low' | 'medium' | 'high'): ChipTone => {
    switch (level) {
      case 'low': return 'ok';
      case 'medium': return 'warn';
      case 'high': return 'danger';
    }
  };

  const formatResponseTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading team workload...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiTile icon={Users} label="Active Agents" value={String(agents.length)} sub="Handling conversations" pastel="blue" />
        <KpiTile icon={UserCheck} label="Total Conversations" value={String(agents.reduce((sum, agent) => sum + agent.totalConversations, 0))} sub="Currently assigned" pastel="mint" />
        <KpiTile icon={AlertCircle} label="Unassigned" value={String(unassignedCount)} sub="Waiting for assignment" pastel="peach" />
      </div>

      {/* Agent List */}
      <Card title="Agent Workload" meta="Real-time overview of team member workload and performance">
        {agents.length === 0 ? (
          <EmptyState icon={Users} title="No active agents" note="No agents with active conversations" />
        ) : (
          <div className="space-y-4">
            {agents.map((agent) => {
              const workloadLevel = getWorkloadLevel(agent.totalConversations);
              const workloadPercent = Math.min(
                (agent.totalConversations / 20) * 100,
                100
              );

              return (
                <div
                  key={agent.agentId}
                  className="border border-border rounded-lg p-4 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="bg-brand/10 text-brand">
                          {getInitials(agent.agentName)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{agent.agentName}</div>
                        <div className="text-sm text-muted-foreground">
                          {agent.totalConversations} conversation
                          {agent.totalConversations !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    <Chip tone={getWorkloadTone(workloadLevel)}>
                      {workloadLevel} load
                    </Chip>
                  </div>

                  <Progress value={workloadPercent} className="mb-3 h-2" />

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Open</div>
                      <div className="font-medium">{agent.openConversations}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Pending</div>
                      <div className="font-medium">{agent.pendingConversations}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs flex items-center gap-1">
                        <Clock className="size-3" />
                        Avg Response
                      </div>
                      <div className="font-medium">
                        {formatResponseTime(agent.averageResponseTime)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
