'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity,
  Briefcase,
  Calendar,
  CheckCircle,
  FileText,
  Link2,
  Save,
  Send,
  Trash2,
  Unlink,
  UserMinus,
  UserPlus,
  XCircle,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import {
  SocialEmptyState,
  SocialPanel,
  SocialStatCard,
  SocialStatGrid,
} from '@/components/social/social-workspace';
import { Button, Chip, Spinner, type ChipTone } from '@/components/ui-kit';
import { Select } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

interface ActivityItem {
  _id: string;
  brandId?: string;
  userId: string;
  userName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const ACTION_CONFIG: Record<string, { icon: LucideIcon; tone: ChipTone; label: string }> = {
  post_created: { icon: FileText, tone: 'gray', label: 'Created post' },
  post_submitted: { icon: Send, tone: 'info', label: 'Submitted for review' },
  post_approved: { icon: CheckCircle, tone: 'ok', label: 'Approved post' },
  post_rejected: { icon: XCircle, tone: 'danger', label: 'Rejected post' },
  post_published: { icon: Send, tone: 'ok', label: 'Published post' },
  post_scheduled: { icon: Calendar, tone: 'info', label: 'Scheduled post' },
  draft_saved: { icon: Save, tone: 'gray', label: 'Saved draft' },
  draft_deleted: { icon: Trash2, tone: 'danger', label: 'Deleted draft' },
  brand_created: { icon: Briefcase, tone: 'brand', label: 'Created brand' },
  account_connected: { icon: Link2, tone: 'ok', label: 'Connected account' },
  account_disconnected: { icon: Unlink, tone: 'gray', label: 'Disconnected account' },
  member_added: { icon: UserPlus, tone: 'info', label: 'Added member' },
  member_removed: { icon: UserMinus, tone: 'danger', label: 'Removed member' },
};

function getActionInfo(action: string) {
  return ACTION_CONFIG[action] || {
    icon: Activity,
    tone: 'gray' as ChipTone,
    label: action.replace(/_/g, ' '),
  };
}

export default function ActivityPage() {
  const { data: session } = useSession();
  const { toast } = useToast();

  const [filterAction, setFilterAction] = useState('all');

  const enabled = !!session?.user;

  const { data, isLoading, isError } = useQuery<{
    activities: ActivityItem[];
    actionCounts: Record<string, number>;
  }>({
    queryKey: ['social-activity', filterAction],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterAction !== 'all') {
        params.set('action', filterAction);
      }

      const response = await fetch(`/api/social/activity?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to load activity');
      }

      return response.json();
    },
    enabled,
  });

  const activities = data?.activities || [];
  const actionCounts = useMemo(() => data?.actionCounts || {}, [data]);
  const loading = enabled ? isLoading : true;

  useEffect(() => {
    if (isError) {
      toast({ variant: 'destructive', title: 'Failed to load activity' });
    }
  }, [isError, toast]);

  const totalActivities = useMemo(
    () => Object.values(actionCounts).reduce((sum, count) => sum + count, 0),
    [actionCounts],
  );

  const filterBar = (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">
        Team actions across posts, drafts, approvals, and account changes
      </span>
      <Select
        value={filterAction}
        onChange={setFilterAction}
        triggerClassName="w-[200px]"
        aria-label="Filter actions"
        options={[
          { value: 'all', label: 'All actions' },
          { value: 'post_submitted', label: 'Submissions' },
          { value: 'post_approved', label: 'Approvals' },
          { value: 'post_rejected', label: 'Rejections' },
          { value: 'post_published', label: 'Published' },
          { value: 'draft_saved', label: 'Drafts' },
        ]}
      />
    </div>
  );

  return (
    <ModuleShell
      title="Activity"
      icon={Activity}
      meta={`${totalActivities} events`}
      primaryAction={
        <Button variant="outline" size="sm" icon={BarChart3} asChild>
          <a href="/social/analytics">Open analytics</a>
        </Button>
      }
      filterBar={filterBar}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <SocialStatGrid className="xl:grid-cols-3">
        <SocialStatCard
          label="Activity"
          value={String(totalActivities)}
          helper="All tracked events"
          icon={Activity}
          tone="purple"
        />
        <SocialStatCard
          label="Approved"
          value={String(actionCounts.post_approved || 0)}
          helper="Posts moved forward"
          icon={CheckCircle}
          tone="green"
        />
        <SocialStatCard
          label="Published"
          value={String(actionCounts.post_published || 0)}
          helper="Posts sent live"
          icon={Send}
          tone="blue"
        />
      </SocialStatGrid>

      <SocialPanel title="Timeline" description="Recent team activity">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : activities.length === 0 ? (
          <SocialEmptyState
            icon={Activity}
            title="No activity"
            description="Activity will appear here once the team starts creating and publishing posts."
          />
        ) : (
          <div className="space-y-4">
            {activities.map((activity, index) => {
              const actionInfo = getActionInfo(activity.action);
              const isLast = index === activities.length - 1;

              const ActionIcon = actionInfo.icon;

              return (
                <div key={activity._id} className="flex gap-4">
                  <div className="flex w-10 flex-col items-center">
                    <Chip
                      tone={actionInfo.tone}
                      className="size-10 justify-center rounded-xl !px-0"
                    >
                      <ActionIcon className="size-4" />
                    </Chip>
                    {!isLast ? <span className="mt-2 h-full w-px bg-border" /> : null}
                  </div>
                  <div className="flex-1 rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{activity.userName}</span>
                          <span className="text-sm text-muted-foreground">{actionInfo.label}</span>
                          {activity.targetName ? (
                            <Chip tone="gray">{activity.targetName}</Chip>
                          ) : null}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(activity.createdAt), 'MMM d · h:mm a')}
                      </div>
                    </div>

                    {activity.metadata && Object.keys(activity.metadata).length > 0 ? (
                      <div className="mt-3 rounded-xl bg-muted/45 px-3 py-3 text-sm text-muted-foreground">
                        {'reviewNote' in activity.metadata && activity.metadata.reviewNote ? (
                          <p className="mb-2 italic text-foreground">
                            &ldquo;{String(activity.metadata.reviewNote)}&rdquo;
                          </p>
                        ) : null}
                        {'reason' in activity.metadata && activity.metadata.reason ? (
                          <p>
                            Reason: {String(activity.metadata.reason).replace(/_/g, ' ')}
                          </p>
                        ) : null}
                        {'scheduledFor' in activity.metadata && activity.metadata.scheduledFor ? (
                          <p>
                            Scheduled for{' '}
                            {format(new Date(String(activity.metadata.scheduledFor)), 'MMM d, yyyy h:mm a')}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SocialPanel>
    </ModuleShell>
  );
}
