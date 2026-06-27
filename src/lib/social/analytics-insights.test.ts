import { it, expect } from 'vitest';

import {
  buildPerformancePulse,
  buildPlatformCards,
  buildTopPostMoments,
  type AnalyticsPlatformSnapshot,
  type AnalyticsPostSnapshot,
  type AnalyticsSummarySnapshot,
  type AnalyticsTrendPoint,
} from './analytics-insights';

const summary: AnalyticsSummarySnapshot = {
  totalPosts: 8,
  totalLikes: 240,
  totalComments: 84,
  totalShares: 36,
  totalReach: 6400,
  totalImpressions: 9200,
  avgEngagementRate: 4.52,
};

const trends: AnalyticsTrendPoint[] = [
  { date: '2026-03-01', posts: 1, engagement: 40, reach: 700 },
  { date: '2026-03-02', posts: 1, engagement: 50, reach: 800 },
  { date: '2026-03-03', posts: 1, engagement: 55, reach: 850 },
  { date: '2026-03-04', posts: 0, engagement: 0, reach: 0 },
  { date: '2026-03-05', posts: 1, engagement: 70, reach: 950 },
  { date: '2026-03-06', posts: 1, engagement: 75, reach: 900 },
  { date: '2026-03-07', posts: 1, engagement: 85, reach: 1100 },
  { date: '2026-03-08', posts: 2, engagement: 105, reach: 1100 },
];

const platforms: AnalyticsPlatformSnapshot[] = [
  {
    platform: 'linkedin',
    posts: 4,
    avgLikes: 44,
    avgComments: 10,
    avgShares: 5,
    avgEngagementRate: 5.6,
  },
  {
    platform: 'instagram',
    posts: 2,
    avgLikes: 60,
    avgComments: 14,
    avgShares: 9,
    avgEngagementRate: 7.8,
  },
  {
    platform: 'x',
    posts: 2,
    avgLikes: 16,
    avgComments: 7,
    avgShares: 4,
    avgEngagementRate: 3.9,
  },
];

const posts: AnalyticsPostSnapshot[] = [
  {
    _id: 'post-1',
    platform: 'linkedin',
    publishedAt: '2026-03-01T10:00:00.000Z',
    contentPreview: 'LinkedIn launch recap',
    hasMedia: true,
    metrics: { likes: 52, comments: 12, shares: 6, reach: 1200, impressions: 1800, engagementRate: 5.8 },
  },
  {
    _id: 'post-2',
    platform: 'instagram',
    publishedAt: '2026-03-02T10:00:00.000Z',
    contentPreview: 'Behind-the-scenes reel',
    hasMedia: true,
    metrics: { likes: 70, comments: 20, shares: 12, reach: 1500, impressions: 1900, engagementRate: 8.1 },
  },
  {
    _id: 'post-3',
    platform: 'x',
    publishedAt: '2026-03-03T10:00:00.000Z',
    contentPreview: 'Short product teaser thread',
    hasMedia: false,
    metrics: { likes: 18, comments: 6, shares: 3, reach: 600, impressions: 900, engagementRate: 3.2 },
  },
  {
    _id: 'post-4',
    platform: 'linkedin',
    publishedAt: '2026-03-04T10:00:00.000Z',
    contentPreview: 'Customer proof point',
    hasMedia: false,
    metrics: { likes: 38, comments: 8, shares: 4, reach: 980, impressions: 1300, engagementRate: 4.4 },
  },
];

it('buildPerformancePulse derives momentum, cadence, and platform signals', () => {
  const result = buildPerformancePulse({
    summary,
    trends,
    platforms,
    posts,
    rangeDays: 8,
  });

  expect(result).toEqual({
    totalEngagement: 360,
    avgEngagementPerPost: 45,
    avgReachPerPost: 800,
    postingCadence: 1,
    momentum: 131.03,
    activeDays: 7,
    mediaPostShare: 50,
    topPlatform: 'instagram',
    topPlatformRate: 7.8,
    opportunityPlatform: 'instagram',
    opportunityPlatformRate: 7.8,
  });
});

it('buildPlatformCards ranks platforms and derives interaction density', () => {
  const result = buildPlatformCards(platforms, summary.totalPosts);

  expect(result).toEqual([
    {
      platform: 'instagram',
      posts: 2,
      avgLikes: 60,
      avgComments: 14,
      avgShares: 9,
      avgEngagementRate: 7.8,
      avgInteractions: 83,
      shareOfPosts: 25,
      rank: 1,
      tone: 'opportunity',
    },
    {
      platform: 'linkedin',
      posts: 4,
      avgLikes: 44,
      avgComments: 10,
      avgShares: 5,
      avgEngagementRate: 5.6,
      avgInteractions: 59,
      shareOfPosts: 50,
      rank: 2,
      tone: 'leader',
    },
    {
      platform: 'x',
      posts: 2,
      avgLikes: 16,
      avgComments: 7,
      avgShares: 4,
      avgEngagementRate: 3.9,
      avgInteractions: 27,
      shareOfPosts: 25,
      rank: 3,
      tone: 'steady',
    },
  ]);
});

it('buildTopPostMoments sorts posts by engagement and exposes impression efficiency', () => {
  const result = buildTopPostMoments(posts, 3);

  expect(result.map((item) => ({
      id: item._id,
      engagement: item.engagement,
      impressionEfficiency: item.impressionEfficiency,
    }))).toEqual([
      { id: 'post-2', engagement: 102, impressionEfficiency: 5.37 },
      { id: 'post-1', engagement: 70, impressionEfficiency: 3.89 },
      { id: 'post-4', engagement: 50, impressionEfficiency: 3.85 },
    ]);
});
