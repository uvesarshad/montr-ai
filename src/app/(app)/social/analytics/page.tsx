'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock3,
  Download,
  Eye,
  FileText,
  Gauge,
  Heart,
  Lock,
  ImageIcon,
  Layers,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { Instagram, Youtube } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { ReportBrandingHeader } from '@/components/social/report-branding-header';
import type { WhiteLabelBranding } from '@/lib/db/models/white-label-profile.model';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  Meter,
  Select as KitSelect,
  Segmented,
  Skeleton,
  TextEffect,
} from '@/components/ui-kit';
import { SOCIAL_INDUSTRIES } from '@/lib/strategy/benchmarks';
import { useToast } from '@/hooks/use-toast';
import {
  LinkedinLogo,
  XLogo,
  FacebookLogo,
  RedditLogo,
  TelegramLogo,
  DribbbleLogo,
  ThreadsLogo,
  GoogleBusinessLogo,
} from '@/components/social-icons';
import { cn } from '@/lib/utils';
import {
  buildContentTypeSplit,
  buildEngagementBreakdown,
  buildPerformancePulse,
  buildPlatformCards,
  buildTopPostMoments,
  type AnalyticsPlatformSnapshot,
  type AnalyticsPostSnapshot,
  type AnalyticsSummarySnapshot,
  type AnalyticsTrendPoint,
} from '@/lib/social/analytics-insights';

interface Brand {
  _id: string;
  name: string;
  handle: string;
  industry?: string | null;
}

// ─── Benchmarks (Epic 7.2) ──────────────────────────────────────────────────
// Shape returned by `/api/social/analytics?view=benchmark` — one card per
// metric comparing the brand's value against an industry baseline band.
type BenchmarkStatus = 'below' | 'within' | 'above';

interface BenchmarkCard {
  metric: string;
  platform?: string;
  label: string;
  brandValue: number;
  band: { min: number; max: number; label: string; unit: 'percent' | 'perWeek' };
  status: BenchmarkStatus;
  percentileHint: number;
}

const benchmarkStatusMeta: Record<
  BenchmarkStatus,
  { label: string; chipTone: 'danger' | 'gray' | 'ok'; meterTone: 'danger' | 'info' | 'ok' }
> = {
  below: { label: 'Below industry', chipTone: 'danger', meterTone: 'danger' },
  within: { label: 'Within range', chipTone: 'gray', meterTone: 'info' },
  above: { label: 'Above industry', chipTone: 'ok', meterTone: 'ok' },
};

function formatBandValue(value: number, unit: 'percent' | 'perWeek') {
  const rounded = round(value, 2);
  return unit === 'percent' ? `${rounded}%` : `${rounded}/wk`;
}

function formatBandRange(band: BenchmarkCard['band']) {
  return `${formatBandValue(band.min, band.unit)} – ${formatBandValue(band.max, band.unit)}`;
}

interface PlatformBreakdown {
  platform: string;
  count: number;
  engagement: number;
}

interface AnalyticsSummary extends AnalyticsSummarySnapshot {
  platformBreakdown: PlatformBreakdown[];
  topPosts: AnalyticsPostSnapshot[];
  recentPosts: AnalyticsPostSnapshot[];
}

interface FollowerSeries {
  platform: string;
  points: Array<{
    date: string;
    followers: number | null;
    newFollowers: number | null;
  }>;
}

type TrendMetric = 'engagement' | 'reach' | 'posts';
type DateRange = '7' | '30' | '90';

const engagementBreakdownConfig = [
  { key: 'likes' as const, label: 'Likes', color: '#2563eb' },
  { key: 'comments' as const, label: 'Comments', color: '#7c3aed' },
  { key: 'shares' as const, label: 'Shares', color: '#0891b2' },
];

const followerLineColors = [
  '#2563eb',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#ca8a04',
];

const dateRangeOptions: Array<{ value: DateRange; label: string }> = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const chartConfig: Record<TrendMetric, { label: string; color: string }> = {
  engagement: { label: 'Engagement', color: '#2563eb' },
  reach: { label: 'Reach', color: '#0891b2' },
  posts: { label: 'Posts', color: '#7c3aed' },
};

const platformIcons: Record<string, React.ReactNode> = {
  x: <XLogo className="size-4" />,
  linkedin: <LinkedinLogo className="size-4" />,
  facebook: <FacebookLogo className="size-4" />,
  instagram: <Instagram className="size-4" />,
  youtube: <Youtube className="size-4" />,
  reddit: <RedditLogo className="size-4" />,
  telegram: <TelegramLogo className="size-4" />,
  dribbble: <DribbbleLogo className="size-4" />,
  threads: <ThreadsLogo className="size-4" />,
  google_business: <GoogleBusinessLogo className="size-4" />,
};

const platformColors: Record<string, string> = {
  x: 'bg-zinc-900 text-white',
  linkedin: 'bg-blue-600 text-white',
  facebook: 'bg-blue-500 text-white',
  instagram:
    'bg-gradient-to-r from-fuchsia-500 via-rose-500 to-orange-400 text-white',
  youtube: 'bg-red-600 text-white',
  reddit: 'bg-orange-500 text-white',
  telegram: 'bg-sky-500 text-white',
  dribbble: 'bg-pink-500 text-white',
  threads: 'bg-neutral-900 text-white',
  google_business: 'bg-emerald-600 text-white',
};

const platformToneStyles = {
  leader: 'border-primary/20 bg-primary/8',
  opportunity: 'border-primary/15 bg-primary/5',
  steady: 'border-border bg-card',
} as const;

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const wholeNumberFormatter = new Intl.NumberFormat('en-US');

function round(value: number, digits = 1) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function formatPlatformName(platform: string) {
  return platform
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatMetricValue(
  value: number,
  mode: 'whole' | 'compact' | 'percent' = 'whole',
) {
  if (mode === 'percent') {
    return `${round(value, 2)}%`;
  }

  return mode === 'compact'
    ? compactNumberFormatter.format(value)
    : wholeNumberFormatter.format(Math.round(value));
}

function formatTrendTick(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return format(parsed, 'MMM d');
}

function formatTrendLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return format(parsed, 'MMM d, yyyy');
}

function getPostEngagement(post: AnalyticsPostSnapshot) {
  return (
    (post.metrics?.likes ?? 0) +
    (post.metrics?.comments ?? 0) +
    (post.metrics?.shares ?? 0)
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to load analytics';
}

function escapeCsvCell(value: string | number) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportPostsToCsv(
  posts: AnalyticsPostSnapshot[],
  fileLabel: string,
) {
  const header = [
    'Published',
    'Platform',
    'Content preview',
    'Has media',
    'Likes',
    'Comments',
    'Shares',
    'Engagement',
    'Reach',
    'Impressions',
  ];

  const rows = [...posts]
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime(),
    )
    .map((post) => {
      const likes = post.metrics?.likes ?? 0;
      const comments = post.metrics?.comments ?? 0;
      const shares = post.metrics?.shares ?? 0;
      return [
        format(new Date(post.publishedAt), 'yyyy-MM-dd HH:mm'),
        formatPlatformName(post.platform),
        post.contentPreview || '',
        post.hasMedia ? 'yes' : 'no',
        likes,
        comments,
        shares,
        likes + comments + shares,
        post.metrics?.reach ?? 0,
        post.metrics?.impressions ?? 0,
      ];
    });

  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');

  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileLabel}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
  accentClass,
  loading,
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ElementType;
  accentClass: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <div className="p-4 pb-3 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </Card>
    );
  }

  return (
    <Card lift>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              {title}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
          <div className={cn('rounded-2xl p-3 shadow-sm', accentClass)}>
            <Icon className="size-5" />
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{helper}</p>
      </div>
    </Card>
  );
}

function InsightPill({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'highlight';
}) {
  const chipTone = tone === 'positive' || tone === 'highlight' ? 'brand' as const : 'gray' as const;
  return (
    <Chip tone={chipTone}>
      <span className="opacity-70">{label}: </span>
      <span className="font-medium">{value}</span>
    </Chip>
  );
}

function PlatformScoreCard({
  platform,
  posts,
  avgInteractions,
  avgEngagementRate,
  shareOfPosts,
  tone,
  rank,
}: {
  platform: string;
  posts: number;
  avgInteractions: number;
  avgEngagementRate: number;
  shareOfPosts: number;
  tone: 'leader' | 'opportunity' | 'steady';
  rank: number;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-shadow hover:shadow-md',
        platformToneStyles[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'rounded-2xl p-3 shadow-sm',
              platformColors[platform] || 'bg-muted text-foreground',
            )}
          >
            {platformIcons[platform]}
          </div>
          <div>
            <p className="text-sm font-semibold">
              {formatPlatformName(platform)}
            </p>
            <p className="text-xs text-muted-foreground">
              {posts} posts · {round(shareOfPosts)}% of output
            </p>
          </div>
        </div>
        <Chip tone="gray">#{rank}</Chip>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-secondary p-3">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Avg interactions
          </p>
          <p className="mt-2 text-xl font-semibold">
            {formatMetricValue(avgInteractions)}
          </p>
        </div>
        <div className="rounded-xl bg-secondary p-3">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Engagement rate
          </p>
          <p className="mt-2 text-xl font-semibold">
            {formatMetricValue(avgEngagementRate, 'percent')}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Channel share</span>
          <span>{round(shareOfPosts)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full',
              platformColors[platform] || 'bg-primary',
            )}
            style={{ width: `${Math.max(shareOfPosts, 6)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function PostMomentCard({
  post,
  emphasis,
}: {
  post: AnalyticsPostSnapshot & {
    engagement?: number;
    impressionEfficiency?: number;
  };
  emphasis: 'top' | 'recent';
}) {
  const engagement = post.engagement ?? getPostEngagement(post);
  const impressionEfficiency =
    post.impressionEfficiency ??
    (post.metrics?.impressions
      ? round((engagement / post.metrics.impressions) * 100, 2)
      : 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'rounded-2xl p-2.5 shadow-sm',
              platformColors[post.platform] || 'bg-muted text-foreground',
            )}
          >
            {platformIcons[post.platform]}
          </div>
          <div>
            <p className="text-sm font-semibold">
              {formatPlatformName(post.platform)}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(post.publishedAt), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {post.hasMedia && (
            <Chip tone="gray" icon={ImageIcon}>Media</Chip>
          )}
          <Chip tone={emphasis === 'top' ? 'brand' : 'gray'}>
            {formatMetricValue(engagement)} interactions
          </Chip>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-foreground/90">
        {post.contentPreview || 'No preview available'}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-muted/60 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Heart className="size-3.5" />
            Likes
          </div>
          <p className="mt-2 text-base font-semibold">
            {formatMetricValue(post.metrics?.likes ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <MessageCircle className="size-3.5" />
            Comments
          </div>
          <p className="mt-2 text-base font-semibold">
            {formatMetricValue(post.metrics?.comments ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Share2 className="size-3.5" />
            Shares
          </div>
          <p className="mt-2 text-base font-semibold">
            {formatMetricValue(post.metrics?.shares ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Eye className="size-3.5" />
            Eff.
          </div>
          <p className="mt-2 text-base font-semibold">
            {formatMetricValue(impressionEfficiency, 'percent')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Benchmarks (Epic 7.2): single comparison row ───────────────────────────
function BenchmarkRow({ card }: { card: BenchmarkCard }) {
  const meta = benchmarkStatusMeta[card.status];
  const platformLabel = card.platform ? formatPlatformName(card.platform) : null;

  return (
    <div className="rounded-xl border border-border bg-secondary p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {card.platform && (
            <div
              className={cn(
                'rounded-2xl p-2.5 shadow-sm',
                platformColors[card.platform] || 'bg-muted text-foreground',
              )}
            >
              {platformIcons[card.platform] ?? <Gauge className="size-4" />}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold">{card.label}</p>
            {platformLabel && (
              <p className="text-xs text-muted-foreground">{platformLabel}</p>
            )}
          </div>
        </div>
        <Chip tone={meta.chipTone}>{meta.label}</Chip>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Your brand
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatBandValue(card.brandValue, card.band.unit)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Industry range
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {formatBandRange(card.band)}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Meter value={card.percentileHint} tone={meta.meterTone} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrendPoint[]>([]);
  const [platforms, setPlatforms] = useState<AnalyticsPlatformSnapshot[]>([]);
  const [posts, setPosts] = useState<AnalyticsPostSnapshot[]>([]);
  const [followerSeries, setFollowerSeries] = useState<FollowerSeries[]>([]);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('engagement');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── Benchmarks (Epic 7.2) state ──────────────────────────────────────────
  const [benchmarkIndustry, setBenchmarkIndustry] = useState('');
  const [benchmarkCards, setBenchmarkCards] = useState<BenchmarkCard[]>([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkLocked, setBenchmarkLocked] = useState(false);
  const [savingIndustry, setSavingIndustry] = useState(false);

  // ─── White-label report branding (Epic 9 — reporting only) ────────────────
  const [reportBranding, setReportBranding] = useState<WhiteLabelBranding | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/social/white-label/live')
      .then((r) => (r.ok ? r.json() : { branding: null }))
      .then((d) => { if (!cancelled) setReportBranding(d?.branding ?? null); })
      .catch(() => { if (!cancelled) setReportBranding(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    async function fetchBrands() {
      try {
        const response = await fetch('/api/social/brands');
        if (!response.ok) {
          throw new Error('Failed to fetch brands');
        }

        const data = await response.json();
        setBrands(data.brands || []);

        if ((data.brands || []).length > 0) {
          setSelectedBrandId(data.brands[0]._id);
        }
      } catch (error) {
        console.error('Failed to fetch brands:', error);
      }
    }

    fetchBrands();
  }, []);

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand._id === selectedBrandId) ?? null,
    [brands, selectedBrandId],
  );

  const rangeDays = useMemo(() => parseInt(dateRange, 10), [dateRange]);
  const dateRangeLabel = useMemo(
    () =>
      dateRangeOptions.find((option) => option.value === dateRange)?.label ??
      'Last 30 days',
    [dateRange],
  );

  const dateParams = useMemo(() => {
    const to = endOfDay(new Date());
    const from = startOfDay(subDays(new Date(), rangeDays));

    return {
      fromDate: from.toISOString(),
      toDate: to.toISOString(),
    };
  }, [rangeDays]);

  const fetchAnalytics = useCallback(async () => {
    if (!selectedBrandId) {
      return;
    }

    setIsRefreshing(true);

    try {
      const params = new URLSearchParams({
        brandId: selectedBrandId,
        ...dateParams,
      });

      const [summaryRes, trendsRes, platformsRes, postsRes, followersRes] =
        await Promise.all([
          fetch(`/api/social/analytics?${params.toString()}&view=summary`),
          fetch(
            `/api/social/analytics?${params.toString()}&view=trends&groupBy=day`,
          ),
          fetch(`/api/social/analytics?${params.toString()}&view=platforms`),
          fetch(
            `/api/social/analytics?${params.toString()}&view=posts&limit=250`,
          ),
          fetch(`/api/social/analytics?${params.toString()}&view=followers`),
        ]);

      if (!summaryRes.ok || !trendsRes.ok || !platformsRes.ok || !postsRes.ok) {
        throw new Error('Failed to load analytics');
      }

      const [summaryData, trendsData, platformsData, postsData] =
        await Promise.all([
          summaryRes.json(),
          trendsRes.json(),
          platformsRes.json(),
          postsRes.json(),
        ]);

      setSummary(summaryData);
      setTrends(trendsData.trends || []);
      setPlatforms(platformsData.platforms || []);
      setPosts(postsData.posts || []);

      // Followers are best-effort: an absent/empty series just hides the card.
      if (followersRes.ok) {
        const followersData = await followersRes.json();
        setFollowerSeries(followersData.followers || []);
      } else {
        setFollowerSeries([]);
      }
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed to load analytics',
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [dateParams, selectedBrandId, toast]);

  useEffect(() => {
    if (!selectedBrandId) {
      return;
    }

    setIsLoading(true);
    fetchAnalytics();
  }, [selectedBrandId, fetchAnalytics]);

  // ─── Benchmarks (Epic 7.2) ────────────────────────────────────────────────
  // Keep the industry picker in sync with the selected brand's stored industry.
  useEffect(() => {
    setBenchmarkIndustry(selectedBrand?.industry ?? '');
  }, [selectedBrand?._id, selectedBrand?.industry]);

  // Fetch the benchmark comparison for the selected brand + date range, scoped
  // to the chosen industry. A 402 means the analytics feature is plan-locked.
  const fetchBenchmark = useCallback(async () => {
    if (!selectedBrandId) {
      return;
    }

    setBenchmarkLoading(true);
    try {
      const params = new URLSearchParams({
        brandId: selectedBrandId,
        view: 'benchmark',
        ...dateParams,
      });
      if (benchmarkIndustry) {
        params.set('industry', benchmarkIndustry);
      }

      const res = await fetch(`/api/social/analytics?${params.toString()}`);

      if (res.status === 402) {
        setBenchmarkLocked(true);
        setBenchmarkCards([]);
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to load benchmarks');
      }

      setBenchmarkLocked(false);
      const data = await res.json();
      setBenchmarkCards(data.benchmark?.cards ?? []);
    } catch (error: unknown) {
      setBenchmarkCards([]);
      toast({
        variant: 'destructive',
        title: 'Failed to load benchmarks',
        description: getErrorMessage(error),
      });
    } finally {
      setBenchmarkLoading(false);
    }
  }, [selectedBrandId, dateParams, benchmarkIndustry, toast]);

  useEffect(() => {
    if (!selectedBrandId) {
      return;
    }
    fetchBenchmark();
  }, [selectedBrandId, fetchBenchmark]);

  // Persist the brand's industry, then refetch benchmarks against the new band.
  const handleIndustryChange = useCallback(
    async (industry: string) => {
      setBenchmarkIndustry(industry);
      if (!selectedBrandId) {
        return;
      }

      setSavingIndustry(true);
      try {
        const res = await fetch(`/api/social/brands/${selectedBrandId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ industry: industry || null }),
        });
        if (!res.ok) {
          throw new Error('Failed to save industry');
        }
        // Reflect the saved industry in local brand state.
        setBrands((prev) =>
          prev.map((brand) =>
            brand._id === selectedBrandId
              ? { ...brand, industry: industry || null }
              : brand,
          ),
        );
      } catch (error: unknown) {
        toast({
          variant: 'destructive',
          title: 'Could not save industry',
          description: getErrorMessage(error),
        });
      } finally {
        setSavingIndustry(false);
      }
    },
    [selectedBrandId, toast],
  );


  const performancePulse = useMemo(
    () =>
      buildPerformancePulse({
        summary: summary ?? {
          totalPosts: 0,
          totalLikes: 0,
          totalComments: 0,
          totalShares: 0,
          totalReach: 0,
          totalImpressions: 0,
          avgEngagementRate: 0,
        },
        trends,
        platforms,
        posts,
        rangeDays,
      }),
    [summary, trends, platforms, posts, rangeDays],
  );

  const platformCards = useMemo(
    () => buildPlatformCards(platforms, summary?.totalPosts ?? 0),
    [platforms, summary?.totalPosts],
  );

  const topPostMoments = useMemo(() => buildTopPostMoments(posts, 4), [posts]);

  const recentPosts = useMemo(
    () =>
      [...posts]
        .sort(
          (left, right) =>
            new Date(right.publishedAt).getTime() -
            new Date(left.publishedAt).getTime(),
        )
        .slice(0, 4),
    [posts],
  );

  const chartData = useMemo(
    () =>
      trends.map((point) => ({
        ...point,
        label: formatTrendTick(point.date),
      })),
    [trends],
  );

  const engagementBreakdown = useMemo(
    () => buildEngagementBreakdown(posts),
    [posts],
  );

  const contentTypeSplit = useMemo(() => buildContentTypeSplit(posts), [posts]);

  // Merge per-platform follower series into one date-keyed dataset for the
  // line chart, and keep only platforms that actually reported absolute totals.
  const followerPlatforms = useMemo(
    () =>
      followerSeries.filter((series) =>
        series.points.some((point) => point.followers !== null),
      ),
    [followerSeries],
  );

  const followerChartData = useMemo(() => {
    if (followerPlatforms.length === 0) {
      return [];
    }

    const byDate = new Map<string, Record<string, number | string>>();
    for (const series of followerPlatforms) {
      for (const point of series.points) {
        if (point.followers === null) {
          continue;
        }
        const row = byDate.get(point.date) ?? { date: point.date };
        row[series.platform] = point.followers;
        byDate.set(point.date, row);
      }
    }

    return Array.from(byDate.values()).sort((left, right) =>
      String(left.date).localeCompare(String(right.date)),
    );
  }, [followerPlatforms]);

  const handleExportCsv = useCallback(() => {
    if (posts.length === 0) {
      toast({
        title: 'Nothing to export',
        description: 'No posts in the selected range yet.',
      });
      return;
    }

    const label = `${(selectedBrand?.name ?? 'social')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}-analytics-${dateRange}d-${format(new Date(), 'yyyy-MM-dd')}`;

    exportPostsToCsv(posts, label);

    toast({
      title: 'Export ready',
      description: `${posts.length} posts exported to CSV.`,
    });
  }, [posts, selectedBrand?.name, dateRange, toast]);

  const peakPoint = useMemo(() => {
    if (chartData.length === 0) {
      return null;
    }

    return chartData.reduce((best, point) =>
      point[trendMetric] > best[trendMetric] ? point : best,
    );
  }, [chartData, trendMetric]);

  const heroNarrative = useMemo(() => {
    if (!summary || summary.totalPosts === 0) {
      return 'Once content starts publishing, this view will surface channel momentum, post winners, and where the next lift is likely to come from.';
    }

    const channelCount = platformCards.length;
    const topPlatformName = performancePulse.topPlatform
      ? formatPlatformName(performancePulse.topPlatform)
      : 'your channels';
    const opportunityName = performancePulse.opportunityPlatform
      ? formatPlatformName(performancePulse.opportunityPlatform)
      : 'your next experiment';

    return `${selectedBrand?.name ?? 'This brand'} published ${summary.totalPosts} posts across ${channelCount} ${channelCount === 1 ? 'channel' : 'channels'} in ${dateRangeLabel.toLowerCase()}, driving ${formatMetricValue(performancePulse.totalEngagement, 'compact')} interactions. ${topPlatformName} is the strongest channel right now, and ${opportunityName} has the best upside if you want to shift more volume.`;
  }, [
    dateRangeLabel,
    performancePulse,
    platformCards.length,
    selectedBrand?.name,
    summary,
  ]);

  const hasAnalytics = (summary?.totalPosts ?? 0) > 0;

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      {brands.length > 1 && (
        <KitSelect
          value={selectedBrandId}
          onChange={setSelectedBrandId}
          placeholder="Select brand"
          triggerClassName="w-[220px]"
          options={brands.map((brand) => ({ value: brand._id, label: brand.name }))}
        />
      )}
      <KitSelect
        value={dateRange}
        onChange={(value) => setDateRange(value as DateRange)}
        triggerClassName="w-[150px]"
        options={dateRangeOptions}
      />
    </div>
  );

  if (brands.length === 0 && !isLoading) {
    return (
      <ModuleShell title="Analytics" icon={BarChart3} contentClassName="flex flex-col gap-3 pb-8">
        <EmptyState
          icon={BarChart3}
          title="No brands found"
          note="Create a brand to start tracking social performance."
          className="min-h-[360px]"
        />
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      title="Analytics"
      icon={BarChart3}
      meta={selectedBrand ? selectedBrand.name : undefined}
      filterBar={filterBar}
      primaryAction={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={handleExportCsv}
            disabled={isLoading || posts.length === 0}
          >
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={fetchAnalytics}
            disabled={isRefreshing}
          />
        </div>
      }
      contentClassName="flex flex-col gap-6 pb-8"
    >
      {/* White-label report branding (Epic 9) — agency branding when approved, else MontrAI */}
      <ReportBrandingHeader branding={reportBranding} />

      <section className="relative overflow-hidden rounded-xl border border-border bg-card px-6 py-6 md:px-8 md:py-8">
        <div className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.18),transparent_34%)]" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <div className="space-y-6">
            <div className="space-y-4">
              <Chip tone="gray">
                Social performance pulse
              </Chip>

              <div className="space-y-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div className="max-w-3xl">
                    <TextEffect
                      as="h1"
                      per="word"
                      preset="fade-in-blur"
                      className="text-3xl font-semibold tracking-tight md:text-4xl"
                    >
                      {selectedBrand?.name ?? 'Social analytics'}
                    </TextEffect>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                      {heroNarrative}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <InsightPill
                      label="Top platform"
                      value={
                        performancePulse.topPlatform
                          ? formatPlatformName(performancePulse.topPlatform)
                          : 'No data yet'
                      }
                      tone="positive"
                    />
                    <InsightPill
                      label="Active days"
                      value={`${performancePulse.activeDays}/${rangeDays}`}
                      tone="default"
                    />
                    <InsightPill
                      label="Media mix"
                      value={`${round(performancePulse.mediaPostShare)}% visual posts`}
                      tone="highlight"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <MetricCard
                    title="Published posts"
                    value={formatMetricValue(summary?.totalPosts ?? 0)}
                    helper={`${dateRangeLabel} activity`}
                    icon={Activity}
                    accentClass="bg-primary/10 text-primary"
                    loading={isLoading}
                  />
                  <MetricCard
                    title="Total engagement"
                    value={formatMetricValue(
                      performancePulse.totalEngagement,
                      'compact',
                    )}
                    helper="Likes, comments, and shares combined"
                    icon={TrendingUp}
                    accentClass="bg-primary/10 text-primary"
                    loading={isLoading}
                  />
                  <MetricCard
                    title="Audience reach"
                    value={formatMetricValue(summary?.totalReach ?? 0, 'compact')}
                    helper={`${formatMetricValue(performancePulse.avgReachPerPost, 'whole')} average reach per post`}
                    icon={Eye}
                    accentClass="bg-primary/10 text-primary"
                    loading={isLoading}
                  />
                  <MetricCard
                    title="Engagement rate"
                    value={formatMetricValue(
                      summary?.avgEngagementRate ?? 0,
                      'percent',
                    )}
                    helper={`${formatMetricValue(performancePulse.avgEngagementPerPost, 'whole')} interactions per post`}
                    icon={Target}
                    accentClass="bg-primary/10 text-primary"
                    loading={isLoading}
                  />
                </div>
              </div>
            </div>
          </div>

          <Card icon={Sparkles} title="What stands out" meta="Quick signals for channel health, momentum, and where to lean next.">
            <div className="p-5 space-y-4">
              <div className="rounded-3xl border border-border/60 bg-muted/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Momentum
                    </p>
                    <p className="mt-2 text-3xl font-semibold">
                      {performancePulse.momentum >= 0 ? '+' : ''}
                      {round(performancePulse.momentum, 2)}%
                    </p>
                  </div>
                  <div
                    className={cn(
                      'rounded-2xl p-3',
                      performancePulse.momentum >= 0
                        ? 'bg-primary/10 text-primary'
                        : 'bg-destructive/10 text-destructive',
                    )}
                  >
                    {performancePulse.momentum >= 0 ? (
                      <ArrowUpRight className="size-5" />
                    ) : (
                      <ArrowDownRight className="size-5" />
                    )}
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Engagement in the second half of the selected range versus the
                  first half.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-secondary p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Best channel now
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {performancePulse.topPlatform
                      ? formatPlatformName(performancePulse.topPlatform)
                      : 'No data'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatMetricValue(
                      performancePulse.topPlatformRate,
                      'percent',
                    )}{' '}
                    average engagement rate
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-secondary p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                    Growth opportunity
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {performancePulse.opportunityPlatform
                      ? formatPlatformName(
                          performancePulse.opportunityPlatform,
                        )
                      : 'No data'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatMetricValue(
                      performancePulse.opportunityPlatformRate,
                      'percent',
                    )}{' '}
                    average engagement rate
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Publishing rhythm
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {round(performancePulse.postingCadence, 2)} posts / day
                    </p>
                  </div>
                  <Clock3 className="size-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {performancePulse.activeDays} active days and{' '}
                  {round(performancePulse.mediaPostShare)}% media-led content in
                  the selected period.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {!hasAnalytics && !isLoading ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics data yet"
          note="Publish content for this brand and metrics will start filling this dashboard with trend lines, top posts, and channel comparisons."
          className="min-h-[280px]"
        />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
            <Card icon={BarChart3} title="Trend explorer" meta="Switch between engagement, reach, and publishing volume." action={
              <Segmented
                value={trendMetric}
                onChange={(value) => setTrendMetric(value as TrendMetric)}
                options={[
                  { value: 'engagement', label: 'Engagement' },
                  { value: 'reach', label: 'Reach' },
                  { value: 'posts', label: 'Posts' },
                ]}
              />
            }>
              <div className="p-5">
                {isLoading ? (
                  <Skeleton className="h-[320px] w-full rounded-3xl" />
                ) : chartData.length > 0 ? (
                  <>
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartData}
                          margin={{ left: 8, right: 8, top: 12, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id={`analytics-${trendMetric}`}
                              x1="0"
                              x2="0"
                              y1="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor={chartConfig[trendMetric].color}
                                stopOpacity={0.42}
                              />
                              <stop
                                offset="100%"
                                stopColor={chartConfig[trendMetric].color}
                                stopOpacity={0.04}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="4 4" opacity={0.18} />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatTrendTick}
                            axisLine={false}
                            tickLine={false}
                            fontSize={12}
                            minTickGap={18}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            fontSize={12}
                            width={48}
                            tickFormatter={(value) =>
                              formatMetricValue(
                                value,
                                value > 999 ? 'compact' : 'whole',
                              )
                            }
                          />
                          <Tooltip
                            formatter={(value: number) => [
                              formatMetricValue(value),
                              chartConfig[trendMetric].label,
                            ]}
                            labelFormatter={(value) =>
                              formatTrendLabel(String(value))
                            }
                            contentStyle={{
                              borderRadius: '18px',
                              borderColor: 'rgba(148, 163, 184, 0.24)',
                              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.14)',
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey={trendMetric}
                            stroke={chartConfig[trendMetric].color}
                            strokeWidth={2.5}
                            fill={`url(#analytics-${trendMetric})`}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-3xl bg-muted/45 p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                          Peak day
                        </p>
                        <p className="mt-2 text-lg font-semibold">
                          {peakPoint ? formatTrendTick(peakPoint.date) : 'N/A'}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {peakPoint
                            ? formatMetricValue(peakPoint[trendMetric])
                            : '0'}{' '}
                          {chartConfig[trendMetric].label.toLowerCase()}
                        </p>
                      </div>
                      <div className="rounded-3xl bg-muted/45 p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                          Active days
                        </p>
                        <p className="mt-2 text-lg font-semibold">
                          {performancePulse.activeDays}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Days with posts or measurable activity
                        </p>
                      </div>
                      <div className="rounded-3xl bg-muted/45 p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                          Cadence
                        </p>
                        <p className="mt-2 text-lg font-semibold">
                          {round(performancePulse.postingCadence, 2)} / day
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {dateRangeLabel.toLowerCase()}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-[320px] items-center justify-center rounded-3xl border border-dashed border-border/70 text-sm text-muted-foreground">
                    No trend data available for this period.
                  </div>
                )}
              </div>
            </Card>

            <Card icon={Trophy} title="Platform scorecards" meta="Ranked by engagement rate with output share and interaction density.">
              <div className="p-5 space-y-4">
                {isLoading ? (
                  <>
                    <Skeleton className="h-32 w-full rounded-3xl" />
                    <Skeleton className="h-32 w-full rounded-3xl" />
                    <Skeleton className="h-32 w-full rounded-3xl" />
                  </>
                ) : platformCards.length > 0 ? (
                  platformCards.map((platform) => (
                    <PlatformScoreCard key={platform.platform} {...platform} />
                  ))
                ) : (
                  <div className="flex h-[320px] items-center justify-center rounded-3xl border border-dashed border-border/70 text-sm text-muted-foreground">
                    No platform comparison data yet.
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* ─── Benchmarks (Epic 7.2) ──────────────────────────────────────
              Self-contained "you vs the industry" block. Picks an industry
              vertical (persisted on the brand) and compares per-platform
              engagement + posting cadence against industry baseline bands.
              A lead will later add a report-branding header above this block. */}
          <Card
            icon={Gauge}
            title="Industry benchmarks"
            meta="Compare your channels against industry baseline ranges for engagement and posting cadence."
            action={
              <KitSelect
                value={benchmarkIndustry}
                onChange={handleIndustryChange}
                placeholder="Select industry"
                triggerClassName="w-[220px]"
                disabled={savingIndustry || benchmarkLocked}
                options={SOCIAL_INDUSTRIES.map((industry) => ({
                  value: industry.value,
                  label: industry.label,
                }))}
              />
            }
          >
            <div className="p-5">
              {benchmarkLocked ? (
                <Banner
                  tone="brand"
                  icon={Lock}
                  title="Benchmarks are a premium feature"
                  action={
                    <Button variant="brand" size="sm" asChild>
                      <a href="/settings/billing">Upgrade plan</a>
                    </Button>
                  }
                >
                  Upgrade to a plan with analytics to compare your performance
                  against industry baselines.
                </Banner>
              ) : benchmarkLoading ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Skeleton className="h-36 w-full rounded-2xl" />
                  <Skeleton className="h-36 w-full rounded-2xl" />
                  <Skeleton className="h-36 w-full rounded-2xl" />
                  <Skeleton className="h-36 w-full rounded-2xl" />
                </div>
              ) : benchmarkCards.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {benchmarkCards.map((card) => (
                    <BenchmarkRow key={card.metric} card={card} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Gauge}
                  title="No benchmark data yet"
                  note="Publish posts on benchmarked platforms (Instagram, X, LinkedIn, Facebook, TikTok, YouTube) and pick your industry to see how you stack up."
                  className="min-h-[200px]"
                />
              )}
            </div>
          </Card>

          <Card icon={Target} title="Channel benchmark matrix" meta="Detailed platform comparison for output, interaction quality, and efficiency.">
            <div className="p-5">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <Skeleton className="h-16 w-full rounded-2xl" />
                </div>
              ) : platformCards.length > 0 ? (
                <div className="space-y-3">
                  {platformCards.map((platform) => (
                    <div
                      key={platform.platform}
                      className="grid gap-4 rounded-xl border border-border bg-secondary p-4 md:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,0.6fr))] md:items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'rounded-2xl p-3 shadow-sm',
                            platformColors[platform.platform] ||
                              'bg-muted text-foreground',
                          )}
                        >
                          {platformIcons[platform.platform]}
                        </div>
                        <div>
                          <p className="font-semibold">
                            {formatPlatformName(platform.platform)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {platform.posts} posts · rank #{platform.rank}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Post share
                        </p>
                        <p className="mt-2 font-semibold">
                          {formatMetricValue(platform.shareOfPosts, 'percent')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Avg likes
                        </p>
                        <p className="mt-2 font-semibold">
                          {formatMetricValue(platform.avgLikes)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Avg comments
                        </p>
                        <p className="mt-2 font-semibold">
                          {formatMetricValue(platform.avgComments)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Avg shares
                        </p>
                        <p className="mt-2 font-semibold">
                          {formatMetricValue(platform.avgShares)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center rounded-3xl border border-dashed border-border/70 text-sm text-muted-foreground">
                  No analytics data yet. Start publishing posts to unlock
                  comparisons.
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
            <Card icon={Layers} title="Engagement breakdown" meta={`Likes, comments, and shares per day across ${dateRangeLabel.toLowerCase()}.`}>
              <div className="p-5">
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full rounded-3xl" />
                ) : engagementBreakdown.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={engagementBreakdown}
                        margin={{ left: 8, right: 8, top: 12, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="4 4" opacity={0.18} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatTrendTick}
                          axisLine={false}
                          tickLine={false}
                          fontSize={12}
                          minTickGap={18}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          fontSize={12}
                          width={48}
                          tickFormatter={(value) =>
                            formatMetricValue(
                              value,
                              value > 999 ? 'compact' : 'whole',
                            )
                          }
                        />
                        <Tooltip
                          formatter={(value: number, name) => [
                            formatMetricValue(value),
                            name,
                          ]}
                          labelFormatter={(value) =>
                            formatTrendLabel(String(value))
                          }
                          contentStyle={{
                            borderRadius: '18px',
                            borderColor: 'rgba(148, 163, 184, 0.24)',
                            boxShadow: '0 20px 50px rgba(15, 23, 42, 0.14)',
                          }}
                        />
                        <Legend
                          iconType="circle"
                          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                        />
                        {engagementBreakdownConfig.map((entry) => (
                          <Bar
                            key={entry.key}
                            dataKey={entry.key}
                            name={entry.label}
                            stackId="engagement"
                            fill={entry.color}
                            radius={[2, 2, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[300px] items-center justify-center rounded-3xl border border-dashed border-border/70 text-sm text-muted-foreground">
                    No engagement data available for this period.
                  </div>
                )}
              </div>
            </Card>

            <Card icon={ImageIcon} title="Content type performance" meta="Media-led posts vs text-only — average interactions per post.">
              <div className="p-5 space-y-4">
                {isLoading ? (
                  <>
                    <Skeleton className="h-28 w-full rounded-3xl" />
                    <Skeleton className="h-28 w-full rounded-3xl" />
                  </>
                ) : (
                  contentTypeSplit.map((entry) => (
                    <div
                      key={entry.type}
                      className="rounded-xl border border-border bg-secondary p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'rounded-2xl p-3 shadow-sm',
                              entry.type === 'media'
                                ? 'bg-brand/10 text-brand'
                                : 'bg-muted text-foreground',
                            )}
                          >
                            {entry.type === 'media' ? (
                              <ImageIcon className="size-4" />
                            ) : (
                              <FileText className="size-4" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">
                              {entry.label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.posts} posts · {round(entry.shareOfPosts)}%
                              of output
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold tracking-tight">
                            {formatMetricValue(entry.avgEngagement)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            avg interactions
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Total interactions</span>
                        <span className="font-medium text-foreground">
                          {formatMetricValue(entry.totalEngagement, 'compact')}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            entry.type === 'media' ? 'bg-brand' : 'bg-foreground/40',
                          )}
                          style={{
                            width: `${Math.max(entry.shareOfPosts, 4)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
                <p className="text-xs text-muted-foreground">
                  Media detection is based on whether a post had attached media;
                  individual media types are not tracked.
                </p>
              </div>
            </Card>
          </div>

          {!isLoading && followerPlatforms.length > 0 && (
            <Card icon={Users} title="Follower growth" meta="Account-level follower totals per platform from synced source metrics.">
              <div className="p-5">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={followerChartData}
                      margin={{ left: 8, right: 8, top: 12, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="4 4" opacity={0.18} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatTrendTick}
                        axisLine={false}
                        tickLine={false}
                        fontSize={12}
                        minTickGap={18}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        fontSize={12}
                        width={48}
                        tickFormatter={(value) =>
                          formatMetricValue(
                            value,
                            value > 999 ? 'compact' : 'whole',
                          )
                        }
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        formatter={(value: number, name) => [
                          formatMetricValue(value),
                          formatPlatformName(String(name)),
                        ]}
                        labelFormatter={(value) => formatTrendLabel(String(value))}
                        contentStyle={{
                          borderRadius: '18px',
                          borderColor: 'rgba(148, 163, 184, 0.24)',
                          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.14)',
                        }}
                      />
                      <Legend
                        iconType="circle"
                        formatter={(value) => formatPlatformName(String(value))}
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      />
                      {followerPlatforms.map((series, index) => (
                        <Line
                          key={series.platform}
                          type="monotone"
                          dataKey={series.platform}
                          stroke={
                            followerLineColors[index % followerLineColors.length]
                          }
                          strokeWidth={2.5}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)]">
            <Card icon={Trophy} title="Top performing posts" meta="Content winners ranked by total interactions and impression efficiency.">
              <div className="p-5 space-y-4">
                {isLoading ? (
                  <>
                    <Skeleton className="h-48 w-full rounded-3xl" />
                    <Skeleton className="h-48 w-full rounded-3xl" />
                  </>
                ) : topPostMoments.length > 0 ? (
                  topPostMoments.map((post) => (
                    <PostMomentCard key={post._id} post={post} emphasis="top" />
                  ))
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-3xl border border-dashed border-border/70 text-sm text-muted-foreground">
                    No top-performing posts available yet.
                  </div>
                )}
              </div>
            </Card>

            <Card icon={Clock3} title="Recent publish rhythm" meta="Latest posts so you can compare freshness against performance.">
              <div className="p-5 space-y-4">
                {isLoading ? (
                  <>
                    <Skeleton className="h-40 w-full rounded-3xl" />
                    <Skeleton className="h-40 w-full rounded-3xl" />
                  </>
                ) : recentPosts.length > 0 ? (
                  recentPosts.map((post) => (
                    <PostMomentCard
                      key={post._id}
                      post={post}
                      emphasis="recent"
                    />
                  ))
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-3xl border border-dashed border-border/70 text-sm text-muted-foreground">
                    No recent posts available yet.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </ModuleShell>
  );
}

