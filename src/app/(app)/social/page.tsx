'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, endOfDay, format, startOfDay, subDays } from 'date-fns';
import {
  Activity,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  LayoutDashboard,
  Layers3,
  Loader2,
  PenSquare,
  Users2,
} from 'lucide-react';

import {
  SocialEmptyState,
  SocialPageLayout,
  SocialPanel,
  SocialSectionLabel,
  SocialStatCard,
  SocialStatGrid,
  SocialToolbar,
} from '@/components/social/social-workspace';
import { ModuleShell } from '@/components/shell/module-shell';
import { Button, Card, Chip, Select, type ChipTone } from '@/components/ui-kit';
import { Button as LinkButton } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface Brand {
  _id: string;
  name: string;
  handle: string;
}

interface ConnectedAccount {
  _id: string;
  platform: string;
}

interface DraftItem {
  id: string;
  title: string;
  content: string;
  mediaCount: number;
  platformCount: number;
  lastEditedAt: string;
}

interface TemplateItem {
  _id: string;
}

interface ScheduledPost {
  id: string;
  content: string;
  scheduledFor: string;
  status: 'pending_approval' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  platforms: Array<{
    accountId: string;
    platform: string;
    platformUsername: string;
  }>;
}

interface AnalyticsSummary {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
}

interface ApprovalStats {
  pending: number;
  approved: number;
  rejected: number;
}

interface ActivityResponse {
  actionCounts?: Record<string, number>;
}

const numberFormatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to load Social';
}

function formatMetric(value: number, compact = false) {
  return compact ? compactFormatter.format(value) : numberFormatter.format(value);
}

function formatStatus(status: ScheduledPost['status']) {
  switch (status) {
    case 'scheduled':
      return 'Queued';
    case 'publishing':
      return 'Running';
    case 'published':
      return 'Done';
    case 'failed':
      return 'Error';
    case 'cancelled':
      return 'Cancelled';
    case 'pending_approval':
    default:
      return 'Review';
  }
}

function getStatusTone(status: ScheduledPost['status']): ChipTone {
  switch (status) {
    case 'published':
      return 'ok';
    case 'failed':
      return 'danger';
    case 'publishing':
    case 'scheduled':
      return 'info';
    case 'pending_approval':
      return 'warn';
    case 'cancelled':
    default:
      return 'gray';
  }
}

export default function SocialOverviewPage() {
  const { toast } = useToast();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoaded, setBrandsLoaded] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [approvalStats, setApprovalStats] = useState<ApprovalStats>({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [activityCount, setActivityCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchBrands() {
      try {
        const response = await fetch('/api/social/brands');
        if (!response.ok) {
          throw new Error('Failed to load brands');
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        const nextBrands = data.brands || [];
        setBrands(nextBrands);
        setSelectedBrandId((current) => current || nextBrands[0]?._id || '');
        setBrandsLoaded(true);
        if (nextBrands.length === 0) {
          setIsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Failed to load brands',
            description: getErrorMessage(error),
          });
          setBrandsLoaded(true);
          setIsLoading(false);
        }
      }
    }

    fetchBrands();

    return () => {
      cancelled = true;
    };
  }, [toast]);

  const fetchOverview = useCallback(async () => {
    if (!selectedBrandId) {
      return;
    }

    const toDate = endOfDay(new Date()).toISOString();
    const fromDate = startOfDay(subDays(new Date(), 30)).toISOString();
    const upcomingToDate = endOfDay(addDays(new Date(), 14)).toISOString();
    const scheduledParams = new URLSearchParams({
      brandId: selectedBrandId,
      fromDate,
      toDate: upcomingToDate,
    });
    const analyticsParams = new URLSearchParams({
      brandId: selectedBrandId,
      fromDate,
      toDate,
      view: 'summary',
    });

    setIsRefreshing(true);

    try {
      const [
        accountsRes,
        draftsRes,
        templatesRes,
        scheduledRes,
        analyticsRes,
        approvalsRes,
        activityRes,
      ] = await Promise.all([
        fetch(`/api/social/brands/${selectedBrandId}/accounts`),
        fetch(`/api/social/drafts?brandId=${selectedBrandId}`),
        fetch(`/api/social/templates?brandId=${selectedBrandId}`),
        fetch(`/api/social/posts/scheduled?${scheduledParams.toString()}`),
        fetch(`/api/social/analytics?${analyticsParams.toString()}`),
        fetch('/api/social/approvals?status=pending'),
        fetch('/api/social/activity'),
      ]);

      if (
        !accountsRes.ok ||
        !draftsRes.ok ||
        !templatesRes.ok ||
        !scheduledRes.ok ||
        !analyticsRes.ok ||
        !activityRes.ok
      ) {
        throw new Error('Failed to load Social');
      }

      const [
        accountsData,
        draftsData,
        templatesData,
        scheduledData,
        analyticsData,
        activityData,
      ] = await Promise.all([
        accountsRes.json(),
        draftsRes.json(),
        templatesRes.json(),
        scheduledRes.json(),
        analyticsRes.json(),
        activityRes.json() as Promise<ActivityResponse>,
      ]);

      setAccounts(accountsData.accounts || []);
      setDrafts(draftsData.drafts || []);
      setTemplates(templatesData.templates || []);
      setScheduledPosts(scheduledData.posts || []);
      setAnalyticsSummary(analyticsData);

      const nextActivityCount = Object.values(activityData.actionCounts || {}).reduce(
        (total, count) => total + count,
        0,
      );
      setActivityCount(nextActivityCount);

      if (approvalsRes.ok) {
        const approvalsData = await approvalsRes.json();
        setApprovalStats(approvalsData.stats || { pending: 0, approved: 0, rejected: 0 });
      } else {
        setApprovalStats({ pending: 0, approved: 0, rejected: 0 });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to load Social',
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedBrandId, toast]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand._id === selectedBrandId) || null,
    [brands, selectedBrandId],
  );

  const engagementCount = useMemo(() => {
    if (!analyticsSummary) {
      return 0;
    }

    return (
      analyticsSummary.totalLikes +
      analyticsSummary.totalComments +
      analyticsSummary.totalShares
    );
  }, [analyticsSummary]);

  const nextPosts = useMemo(
    () =>
      [...scheduledPosts]
        .sort(
          (left, right) =>
            new Date(left.scheduledFor).getTime() -
            new Date(right.scheduledFor).getTime(),
        )
        .slice(0, 6),
    [scheduledPosts],
  );

  const newestDrafts = useMemo(
    () =>
      [...drafts]
        .sort(
          (left, right) =>
            new Date(right.lastEditedAt).getTime() -
            new Date(left.lastEditedAt).getTime(),
        )
        .slice(0, 3),
    [drafts],
  );

  const newPostButton = (
    <LinkButton asChild size="sm">
      <Link href="/social/create-post">
        <PenSquare className="mr-2 size-4" />
        New post
      </Link>
    </LinkButton>
  );

  if (!brandsLoaded || (isLoading && !selectedBrandId)) {
    return (
      <ModuleShell
        title="Social"
        icon={LayoutDashboard}
        meta={selectedBrand ? `${selectedBrand.name} · ${scheduledPosts.length} scheduled` : `${scheduledPosts.length} scheduled`}
        primaryAction={newPostButton}
      >
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </ModuleShell>
    );
  }

  if (brands.length === 0) {
    return (
      <ModuleShell
        title="Social"
        icon={LayoutDashboard}
        meta={`${scheduledPosts.length} scheduled`}
        primaryAction={newPostButton}
      >
        <SocialPageLayout>
          <SocialEmptyState
            icon={Layers3}
            title="No brands yet"
            description="Create a brand and connect social accounts to start planning posts."
            action={{ label: 'Open settings', href: '/settings?tab=connections' }}
          />
        </SocialPageLayout>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      title="Social"
      icon={LayoutDashboard}
      meta={selectedBrand ? `${selectedBrand.name} · ${scheduledPosts.length} scheduled` : `${scheduledPosts.length} scheduled`}
      primaryAction={newPostButton}
    >
    <SocialPageLayout>
      <SocialToolbar>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {brands.length > 1 ? (
            <Select
              value={selectedBrandId}
              onChange={setSelectedBrandId}
              placeholder="Select brand"
              triggerClassName="w-full lg:w-[220px]"
              options={brands.map((brand) => ({ value: brand._id, label: brand.name }))}
            />
          ) : (
            <span className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium">
              {selectedBrand?.name || 'Brand'}
            </span>
          )}
          <div className="text-sm text-muted-foreground">
            Next publish window covers the next 14 days
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchOverview()}
          disabled={isRefreshing}
        >
          {isRefreshing ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Refresh
        </Button>
      </SocialToolbar>

      <SocialStatGrid>
        <SocialStatCard
          label="Scheduled"
          value={formatMetric(scheduledPosts.length)}
          helper={`${approvalStats.pending} pending review`}
          icon={CalendarClock}
          tone="purple"
        />
        <SocialStatCard
          label="Drafts"
          value={formatMetric(drafts.length)}
          helper={`${newestDrafts.length} updated recently`}
          icon={FileText}
          tone="amber"
        />
        <SocialStatCard
          label="Accounts"
          value={formatMetric(accounts.length)}
          helper={`${brands.length} brand${brands.length === 1 ? '' : 's'} in workspace`}
          icon={Users2}
          tone="blue"
        />
        <SocialStatCard
          label="Engagement"
          value={formatMetric(engagementCount, true)}
          helper={`${formatMetric(analyticsSummary?.totalPosts || 0)} posts in 30 days`}
          icon={BarChart3}
          tone="green"
        />
      </SocialStatGrid>

      <SocialPanel
        title="Post queue"
        description="Next scheduled and pending review posts"
        action={
          <LinkButton asChild variant="outline" size="sm">
            <Link href="/social/calendar">Open calendar</Link>
          </LinkButton>
        }
      >
        {nextPosts.length === 0 ? (
          <SocialEmptyState
            icon={CalendarClock}
            title="Nothing scheduled"
            description="Create a post or move a draft into the calendar."
            action={{ label: 'New post', href: '/social/create-post' }}
          />
        ) : (
          <div className="space-y-3">
            {nextPosts.map((post) => (
              <Link
                key={post.id}
                href="/social/calendar"
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/25"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={getStatusTone(post.status)}>{formatStatus(post.status)}</Chip>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(post.scheduledFor), 'EEE, MMM d · h:mm a')}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium leading-6 text-foreground">
                      {post.content || 'Untitled post'}
                    </p>
                  </div>
                  <ChevronRight className="hidden size-4 text-muted-foreground lg:block" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {post.platforms.map((platform) => (
                    <Chip key={`${post.id}-${platform.accountId}`} tone="gray">
                      {platform.platform}
                    </Chip>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </SocialPanel>

      <div className="space-y-3">
        <SocialSectionLabel>Workflow</SocialSectionLabel>
        <div className="grid gap-4 xl:grid-cols-3">
          {[
            {
              href: '/social/drafts',
              icon: FileText,
              value: formatMetric(drafts.length),
              label: 'Drafts',
              note: newestDrafts[0]
                ? `Last edited ${format(new Date(newestDrafts[0].lastEditedAt), 'MMM d')}`
                : 'Open saved drafts and keep writing',
            },
            {
              href: '/social/approvals',
              icon: CheckCircle2,
              value: formatMetric(approvalStats.pending),
              label: 'Pending review',
              note: `${approvalStats.approved} approved · ${approvalStats.rejected} rejected`,
            },
            {
              href: '/social/activity',
              icon: Activity,
              value: formatMetric(activityCount),
              label: 'Activity',
              note: `${formatMetric(templates.length)} templates available`,
            },
          ].map(({ href, icon: TileIcon, value, label, note }) => (
            <Link key={href} href={href} className="group block">
              <Card lift spotlight className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-muted text-brand-strong">
                    <TileIcon className="size-5" />
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-4 space-y-1">
                  <div className="text-lg font-semibold tracking-tight">{value}</div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-sm text-muted-foreground">{note}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <SocialPanel title="Recent drafts" description="Open the latest drafts without leaving the overview">
          {newestDrafts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No drafts yet
            </div>
          ) : (
            <div className="space-y-3">
              {newestDrafts.map((draft) => (
                <Link
                  key={draft.id}
                  href={`/social/create-post?draftId=${draft.id}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/20"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{draft.title || 'Untitled draft'}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {draft.content || 'No content yet'}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(draft.lastEditedAt), 'MMM d')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </SocialPanel>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-muted text-brand-strong">
                <Clock3 className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">Next publish window</p>
                <p className="text-sm text-muted-foreground">
                  {nextPosts[0]
                    ? format(new Date(nextPosts[0].scheduledFor), 'EEE, MMM d · h:mm a')
                    : 'Nothing scheduled'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-medium">Templates</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMetric(templates.length)} reusable layouts ready for the composer
            </p>
            <LinkButton asChild variant="outline" size="sm" className="mt-4 w-full">
              <Link href="/social/templates">Open templates</Link>
            </LinkButton>
          </Card>
        </div>
      </div>
    </SocialPageLayout>
    </ModuleShell>
  );
}
