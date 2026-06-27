'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Send,
  CheckCheck,
  Eye,
  XCircle,
  Pause,
  Play,
  Clock,
  Users,
  TrendingUp,
  SearchX,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  KpiTile,
  Meter,
  Skeleton,
  type ChipTone,
  type KpiTileProps,
} from '@/components/ui-kit';

interface CampaignStats {
  campaign: {
    id: string;
    name: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
    totalRecipients: number;
  };
  messages: {
    total: number;
    scheduled: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  rates: {
    delivery: string;
    read: string;
    failure: string;
  };
  estimatedCompletionAt?: string;
}

interface CampaignMonitoringDashboardProps {
  campaignId: string;
  onClose?: () => void;
}

const STATUS_TONE: Record<string, ChipTone> = {
  running: 'info',
  completed: 'ok',
  paused: 'warn',
};

export function CampaignMonitoringDashboard({
  campaignId,
  onClose: _onClose,
}: CampaignMonitoringDashboardProps) {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch campaign stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/whatsapp/campaigns/${campaignId}/stats`);
      const data = await response.json();

      if (response.ok) {
        setStats(data.data);
      } else {
        toast.error('Failed to fetch campaign stats');
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  // Pause campaign
  const handlePause = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/campaigns/${campaignId}/pause`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Campaign paused successfully');
        fetchStats();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to pause campaign');
      }
    } catch (error) {
      toast.error('Error pausing campaign');
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  // Resume campaign
  const handleResume = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/campaigns/${campaignId}/resume`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Campaign resumed successfully');
        fetchStats();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to resume campaign');
      }
    } catch (error) {
      toast.error('Error resuming campaign');
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate progress percentage
  const getProgress = () => {
    if (!stats) return 0;
    const { total, sent, failed } = stats.messages;
    if (total === 0) return 0;
    return ((sent + failed) / total) * 100;
  };

  // Auto-refresh stats for running campaigns
  useEffect(() => {
    fetchStats();

    const interval = setInterval(() => {
      if (stats?.campaign.status === 'running') {
        fetchStats();
      }
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <EmptyState
        icon={SearchX}
        title="Campaign not found"
        note="We couldn't load stats for this campaign."
      />
    );
  }

  const progress = getProgress();

  const kpiItems: KpiTileProps[] = [
    {
      icon: Users,
      label: 'Total Recipients',
      value: stats.campaign.totalRecipients,
      iconTone: 'info',
    },
    {
      icon: Send,
      label: 'Sent',
      value: stats.messages.sent,
      iconTone: 'ok',
      sub: `${
        stats.messages.total > 0
          ? ((stats.messages.sent / stats.messages.total) * 100).toFixed(1)
          : 0
      }% of total`,
    },
    {
      icon: CheckCheck,
      label: 'Delivered',
      value: stats.messages.delivered,
      iconTone: 'info',
      sub: `${stats.rates.delivery}% delivery rate`,
    },
    {
      icon: Eye,
      label: 'Read',
      value: stats.messages.read,
      iconTone: 'brand',
      sub: `${stats.rates.read}% read rate`,
    },
    {
      icon: XCircle,
      label: 'Failed',
      value: stats.messages.failed,
      iconTone: 'warn',
      sub: `${stats.rates.failure}% failure rate`,
    },
    ...(stats.messages.scheduled > 0
      ? [
          {
            icon: Clock,
            label: 'Scheduled',
            value: stats.messages.scheduled,
            iconTone: 'warn' as const,
            sub: 'Pending delivery',
          },
        ]
      : []),
    {
      icon: TrendingUp,
      label: 'Engagement',
      value: `${
        stats.messages.delivered > 0
          ? ((stats.messages.read / stats.messages.delivered) * 100).toFixed(1)
          : 0
      }%`,
      iconTone: 'brand',
      sub: 'Read rate of delivered',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{stats.campaign.name}</h2>
          <div className="flex items-center gap-2 mt-2">
            <Chip tone={STATUS_TONE[stats.campaign.status] ?? 'gray'} dot>
              {stats.campaign.status}
            </Chip>
            {stats.campaign.startedAt && (
              <span className="text-sm text-muted-foreground">
                Started {new Date(stats.campaign.startedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {stats.campaign.status === 'running' && (
            <Button
              variant="outline"
              size="sm"
              icon={Pause}
              onClick={handlePause}
              disabled={actionLoading}
            >
              Pause
            </Button>
          )}
          {stats.campaign.status === 'paused' && (
            <Button
              variant="outline"
              size="sm"
              icon={Play}
              onClick={handleResume}
              disabled={actionLoading}
            >
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {stats.campaign.status === 'running' && (
        <Card title="Campaign Progress" meta={`${stats.messages.sent + stats.messages.failed} of ${stats.messages.total} messages processed`}>
          <div className="p-4">
            <Meter value={progress} tone="info" className="h-2" />
            <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
              <span>{progress.toFixed(1)}% complete</span>
              {stats.estimatedCompletionAt && (
                <span>
                  ETA: {new Date(stats.estimatedCompletionAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiItems.map((k) => (
          <KpiTile key={String(k.label)} {...k} />
        ))}
      </div>

      {/* Completion Info */}
      {stats.campaign.status === 'completed' && stats.campaign.completedAt && (
        <Card>
          <div className="py-6 text-center">
            <CheckCheck className="size-12 mx-auto text-success mb-2" />
            <h3 className="text-lg font-semibold mb-1">Campaign Completed</h3>
            <p className="text-sm text-muted-foreground">
              Finished at {new Date(stats.campaign.completedAt).toLocaleString()}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
