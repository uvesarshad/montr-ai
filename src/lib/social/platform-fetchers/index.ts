import { MetricPlatform } from '@/lib/db/models/analytics.model';
import { IPlatformFetcher } from './types';
import { xFetcher } from './x-fetcher';
import { linkedinFetcher } from './linkedin-fetcher';
import { instagramFetcher } from './instagram-fetcher';
import { facebookFetcher } from './facebook-fetcher';
import { pinterestFetcher } from './pinterest-fetcher';
import { tiktokFetcher } from './tiktok-fetcher';
import { youtubeFetcher } from './youtube-fetcher';
import { threadsFetcher } from './threads-fetcher';
import { googleBusinessFetcher } from './google-business-fetcher';

export const platformFetchers: Partial<Record<MetricPlatform, IPlatformFetcher>> = {
    x: xFetcher,
    linkedin: linkedinFetcher,
    instagram: instagramFetcher,
    facebook: facebookFetcher,
    pinterest: pinterestFetcher,
    tiktok: tiktokFetcher,
    youtube: youtubeFetcher,
    threads: threadsFetcher,
    google_business: googleBusinessFetcher,
};
