export interface AnalyticsSummarySnapshot {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalReach: number;
  totalImpressions: number;
  avgEngagementRate: number;
}

export interface AnalyticsTrendPoint {
  date: string;
  posts: number;
  engagement: number;
  reach: number;
}

export interface AnalyticsPlatformSnapshot {
  platform: string;
  posts: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  avgEngagementRate: number;
}

export interface AnalyticsPostSnapshot {
  _id: string;
  platform: string;
  publishedAt: string;
  contentPreview: string;
  hasMedia: boolean;
  metrics?: {
    likes?: number;
    comments?: number;
    shares?: number;
    reach?: number;
    impressions?: number;
    engagementRate?: number;
  };
}

export interface AnalyticsPerformancePulse {
  totalEngagement: number;
  avgEngagementPerPost: number;
  avgReachPerPost: number;
  postingCadence: number;
  momentum: number;
  activeDays: number;
  mediaPostShare: number;
  topPlatform: string | null;
  topPlatformRate: number;
  opportunityPlatform: string | null;
  opportunityPlatformRate: number;
}

export interface AnalyticsPlatformCard extends AnalyticsPlatformSnapshot {
  avgInteractions: number;
  shareOfPosts: number;
  rank: number;
  tone: 'leader' | 'opportunity' | 'steady';
}

export interface AnalyticsTopMoment extends AnalyticsPostSnapshot {
  engagement: number;
  impressionEfficiency: number;
}

interface BuildPerformancePulseInput {
  summary: AnalyticsSummarySnapshot;
  trends: AnalyticsTrendPoint[];
  platforms: AnalyticsPlatformSnapshot[];
  posts: AnalyticsPostSnapshot[];
  rangeDays: number;
}

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function getPostEngagement(post: AnalyticsPostSnapshot) {
  return (
    (post.metrics?.likes ?? 0) +
    (post.metrics?.comments ?? 0) +
    (post.metrics?.shares ?? 0)
  );
}

export function buildPerformancePulse({
  summary,
  trends,
  platforms,
  posts,
  rangeDays,
}: BuildPerformancePulseInput): AnalyticsPerformancePulse {
  const totalEngagement =
    summary.totalLikes + summary.totalComments + summary.totalShares;
  const activeDays = trends.filter(
    (point) => point.posts > 0 || point.engagement > 0 || point.reach > 0,
  ).length;
  const mediaPosts = posts.filter((post) => post.hasMedia).length;
  const sortedPlatforms = buildPlatformCards(platforms, summary.totalPosts);
  const topPlatform = sortedPlatforms[0];
  const maxPosts = Math.max(...platforms.map((platform) => platform.posts), 0);
  const opportunityPlatform = sortedPlatforms.find(
    (platform) => platform.posts < maxPosts,
  ) ?? topPlatform;
  const midpoint = Math.max(1, Math.floor(trends.length / 2));
  const previousEngagement = trends
    .slice(0, midpoint)
    .reduce((sum, point) => sum + point.engagement, 0);
  const currentEngagement = trends
    .slice(midpoint)
    .reduce((sum, point) => sum + point.engagement, 0);

  let momentum = 0;

  if (previousEngagement === 0) {
    momentum = currentEngagement > 0 ? 100 : 0;
  } else {
    momentum = round(
      ((currentEngagement - previousEngagement) / previousEngagement) * 100,
    );
  }

  return {
    totalEngagement,
    avgEngagementPerPost: round(totalEngagement / Math.max(summary.totalPosts, 1)),
    avgReachPerPost: round(summary.totalReach / Math.max(summary.totalPosts, 1)),
    postingCadence: round(summary.totalPosts / Math.max(rangeDays, 1)),
    momentum,
    activeDays,
    mediaPostShare: round((mediaPosts / Math.max(posts.length, 1)) * 100),
    topPlatform: topPlatform?.platform ?? null,
    topPlatformRate: topPlatform?.avgEngagementRate ?? 0,
    opportunityPlatform: opportunityPlatform?.platform ?? null,
    opportunityPlatformRate: opportunityPlatform?.avgEngagementRate ?? 0,
  };
}

export function buildPlatformCards(
  platforms: AnalyticsPlatformSnapshot[],
  totalPosts: number,
): AnalyticsPlatformCard[] {
  const maxPosts = Math.max(...platforms.map((platform) => platform.posts), 0);

  return [...platforms]
    .map((platform) => ({
      ...platform,
      avgInteractions: round(
        platform.avgLikes + platform.avgComments + platform.avgShares,
      ),
      shareOfPosts: round((platform.posts / Math.max(totalPosts, 1)) * 100),
    }))
    .sort((left, right) => {
      if (right.avgEngagementRate !== left.avgEngagementRate) {
        return right.avgEngagementRate - left.avgEngagementRate;
      }

      if (right.avgInteractions !== left.avgInteractions) {
        return right.avgInteractions - left.avgInteractions;
      }

      return right.posts - left.posts;
    })
    .map((platform, index) => ({
      ...platform,
      rank: index + 1,
      tone:
        platform.posts === maxPosts
          ? 'leader'
          : index === 0
            ? 'opportunity'
            : 'steady',
    }));
}

export interface AnalyticsEngagementBreakdownPoint {
  date: string;
  likes: number;
  comments: number;
  shares: number;
}

/**
 * Per-day likes/comments/shares totals across the supplied posts, bucketed by
 * the post's published date (UTC day). Days without posts are omitted — the
 * chart shows only days with measured activity. Every value comes from stored
 * post metrics; nothing is interpolated.
 */
export function buildEngagementBreakdown(
  posts: AnalyticsPostSnapshot[],
): AnalyticsEngagementBreakdownPoint[] {
  const byDate = new Map<string, AnalyticsEngagementBreakdownPoint>();

  for (const post of posts) {
    const parsed = new Date(post.publishedAt);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    const date = parsed.toISOString().slice(0, 10);
    const existing =
      byDate.get(date) ?? { date, likes: 0, comments: 0, shares: 0 };
    existing.likes += post.metrics?.likes ?? 0;
    existing.comments += post.metrics?.comments ?? 0;
    existing.shares += post.metrics?.shares ?? 0;
    byDate.set(date, existing);
  }

  return Array.from(byDate.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

export interface AnalyticsContentTypeSplit {
  type: 'media' | 'text';
  label: string;
  posts: number;
  totalEngagement: number;
  avgEngagement: number;
  shareOfPosts: number;
}

/**
 * Compare media-led posts against text-only posts. The model stores a boolean
 * `hasMedia` (no media-type granularity), so this is an honest media-vs-text
 * split — labelled as such. Avg engagement = (likes+comments+shares)/posts.
 */
export function buildContentTypeSplit(
  posts: AnalyticsPostSnapshot[],
): AnalyticsContentTypeSplit[] {
  const buckets: Record<'media' | 'text', { posts: number; totalEngagement: number }> = {
    media: { posts: 0, totalEngagement: 0 },
    text: { posts: 0, totalEngagement: 0 },
  };

  for (const post of posts) {
    const key = post.hasMedia ? 'media' : 'text';
    buckets[key].posts += 1;
    buckets[key].totalEngagement += getPostEngagement(post);
  }

  const total = posts.length;

  return (['media', 'text'] as const).map((type) => {
    const bucket = buckets[type];
    return {
      type,
      label: type === 'media' ? 'With media' : 'Text only',
      posts: bucket.posts,
      totalEngagement: bucket.totalEngagement,
      avgEngagement: round(bucket.totalEngagement / Math.max(bucket.posts, 1)),
      shareOfPosts: round((bucket.posts / Math.max(total, 1)) * 100),
    };
  });
}

export function buildTopPostMoments(
  posts: AnalyticsPostSnapshot[],
  limit = 5,
): AnalyticsTopMoment[] {
  return [...posts]
    .map((post) => {
      const engagement = getPostEngagement(post);
      const impressions = post.metrics?.impressions ?? 0;

      return {
        ...post,
        engagement,
        impressionEfficiency: impressions > 0
          ? round((engagement / impressions) * 100)
          : 0,
      };
    })
    .sort((left, right) => {
      if (right.engagement !== left.engagement) {
        return right.engagement - left.engagement;
      }

      return (
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime()
      );
    })
    .slice(0, limit);
}
