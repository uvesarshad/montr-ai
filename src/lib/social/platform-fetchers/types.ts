import { IPlatformMetrics, MetricPlatform } from '../../db/models/analytics.model';

export interface PostMetricResult {
    metrics: Partial<IPlatformMetrics>;
    externalPostId: string;
    postUrl?: string;
}

export interface IPlatformFetcher {
    platform: MetricPlatform;
    fetchPostMetrics(accountId: string, externalPostId: string): Promise<PostMetricResult>;
}
