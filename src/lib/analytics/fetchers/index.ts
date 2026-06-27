/**
 * Analytics fetcher registry — the sync scheduler iterates connections
 * and dispatches to the fetcher registered for each source type.
 *
 * X is snapshot-level only (free-tier /2/users/me); time-bound X analytics
 * need a paid API tier. Post-level metrics stay in src/lib/social/platform-fetchers/.
 */
import type { MetricsSourceType } from '@/lib/db/models/metrics-snapshot.model';
import type { AnalyticsFetcher } from './types';
import { metaAdsFetcher } from './meta-ads.fetcher';
import { googleAdsFetcher } from './google-ads.fetcher';
import { ga4Fetcher } from './ga4.fetcher';
import { searchConsoleFetcher } from './search-console.fetcher';
import { youtubeChannelFetcher } from './youtube-channel.fetcher';
import {
    facebookPageFetcher,
    instagramAccountFetcher,
    threadsAccountFetcher,
    linkedinOrgFetcher,
    tiktokAccountFetcher,
    xAccountFetcher,
} from './social-accounts.fetcher';

export type { AnalyticsFetcher, FetchWindow, MetricRow, ConnectionKind } from './types';
export { lastNDaysWindow, toDateKey } from './types';

export const analyticsFetchers: Partial<Record<MetricsSourceType, AnalyticsFetcher>> = {
    meta_ads: metaAdsFetcher,
    google_ads: googleAdsFetcher,
    ga4: ga4Fetcher,
    search_console: searchConsoleFetcher,
    youtube: youtubeChannelFetcher,
    facebook: facebookPageFetcher,
    instagram: instagramAccountFetcher,
    threads: threadsAccountFetcher,
    linkedin: linkedinOrgFetcher,
    tiktok: tiktokAccountFetcher,
    x: xAccountFetcher, // snapshot-level (free tier); time-bound analytics need a paid tier
};

export function getAnalyticsFetcher(sourceType: MetricsSourceType): AnalyticsFetcher | undefined {
    return analyticsFetchers[sourceType];
}
