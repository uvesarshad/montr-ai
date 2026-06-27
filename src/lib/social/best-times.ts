/**
 * Best-time-to-post recommendations (social audit §E).
 *
 * Derives posting-time recommendations from a brand's historical post
 * performance. We read `PostAnalytics` for the brand (last ~90 days), bucket
 * each analyzed post by (dayOfWeek, hourOfDay), score every bucket by the
 * average engagement (likes + comments + shares) of its posts, and surface the
 * highest-scoring buckets — both overall and per platform.
 *
 * When a brand has too little history to be meaningful (< MIN_TOTAL_POSTS
 * analyzed) we return generic industry-default slots with `fallback: true` so
 * the calendar UI always has something to overlay.
 *
 * Multi-tenancy: callers MUST have already run `assertBrandAccess` for the
 * brandId. We additionally scope by `organizationId` when provided.
 */

import { connectDB } from '@/lib/mongodb';
import { PostAnalytics } from '@/lib/db/models/analytics.model';

/** A single recommended posting slot. */
export interface BestTimeSlot {
    /** 0 = Sunday … 6 = Saturday (matches JS Date.getUTCDay / date-fns getDay). */
    dayOfWeek: number;
    /** Hour of day, 0–23 (local-to-the-post; derived from stored publishedAt). */
    hour: number;
    /** Average engagement for posts in this bucket (likes + comments + shares). */
    score: number;
    /** Number of analyzed posts that fell into this bucket. */
    samples: number;
}

export interface BestTimesResult {
    overall: BestTimeSlot[];
    byPlatform: Record<string, BestTimeSlot[]>;
    /** True when results are generic defaults (not enough real history). */
    fallback: boolean;
    /** Count of analyzed posts the recommendation was derived from. */
    analyzedPosts: number;
}

// Tunables.
const LOOKBACK_DAYS = 90;
const MIN_SAMPLES_PER_BUCKET = 2; // a bucket needs >= this many posts to be ranked
const MIN_TOTAL_POSTS = 10; // below this we fall back to industry defaults
const TOP_N_OVERALL = 6;
const TOP_N_PER_PLATFORM = 4;

interface BucketAcc {
    dayOfWeek: number;
    hour: number;
    samples: number;
    totalEngagement: number;
}

function bucketKey(dayOfWeek: number, hour: number): string {
    return `${dayOfWeek}-${hour}`;
}

/**
 * Reduce an accumulator map into the top-N scored slots.
 * Buckets below the minimum sample size are dropped; ties broken by samples.
 */
function rankBuckets(buckets: Map<string, BucketAcc>, topN: number): BestTimeSlot[] {
    const slots: BestTimeSlot[] = [];
    for (const acc of buckets.values()) {
        if (acc.samples < MIN_SAMPLES_PER_BUCKET) continue;
        slots.push({
            dayOfWeek: acc.dayOfWeek,
            hour: acc.hour,
            score: Math.round((acc.totalEngagement / acc.samples) * 100) / 100,
            samples: acc.samples,
        });
    }
    slots.sort((a, b) => (b.score - a.score) || (b.samples - a.samples));
    return slots.slice(0, topN);
}

/**
 * Generic, well-known engagement windows used when a brand lacks history.
 * Tue–Thu 9–11am (work-hours discovery) + every weekday 7–9pm (evening scroll).
 * Scores here are nominal weights, not real engagement.
 */
function industryDefaults(): BestTimeSlot[] {
    const slots: BestTimeSlot[] = [];
    // Tue(2), Wed(3), Thu(4) mornings 9, 10, 11.
    for (const dayOfWeek of [2, 3, 4]) {
        for (const hour of [9, 10, 11]) {
            slots.push({ dayOfWeek, hour, score: 0, samples: 0 });
        }
    }
    // Weekdays Mon–Fri (1–5) evenings 19, 20.
    for (const dayOfWeek of [1, 2, 3, 4, 5]) {
        for (const hour of [19, 20]) {
            slots.push({ dayOfWeek, hour, score: 0, samples: 0 });
        }
    }
    return slots;
}

/**
 * Compute best posting times for a brand from historical analytics.
 * Caller must have already verified brand access.
 */
export async function computeBestTimes(
    brandId: string
): Promise<BestTimesResult> {
    await connectDB();

    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const query: Record<string, unknown> = {
        brandId,
        publishedAt: { $gte: since },
    };
    // PostAnalytics has no organizationId field today; brandId is the tenant
    // boundary (and access is already verified). organizationId is accepted for
    // forward-compatibility / call-site symmetry but not used in the filter.
    const posts = await PostAnalytics.find(query)
        .select('platform publishedAt metrics')
        .lean()
        .exec();

    const analyzedPosts = posts.length;

    if (analyzedPosts < MIN_TOTAL_POSTS) {
        return {
            overall: industryDefaults().slice(0, TOP_N_OVERALL * 2),
            byPlatform: {},
            fallback: true,
            analyzedPosts,
        };
    }

    const overallBuckets = new Map<string, BucketAcc>();
    const platformBuckets = new Map<string, Map<string, BucketAcc>>();

    for (const post of posts) {
        const published = post.publishedAt ? new Date(post.publishedAt) : null;
        if (!published || isNaN(published.getTime())) continue;

        const dayOfWeek = published.getUTCDay();
        const hour = published.getUTCHours();
        const m = post.metrics || {};
        const engagement = (m.likes || 0) + (m.comments || 0) + (m.shares || 0);

        const key = bucketKey(dayOfWeek, hour);

        // Overall.
        const oAcc = overallBuckets.get(key) || { dayOfWeek, hour, samples: 0, totalEngagement: 0 };
        oAcc.samples += 1;
        oAcc.totalEngagement += engagement;
        overallBuckets.set(key, oAcc);

        // Per platform.
        const platform = String(post.platform || 'unknown');
        let pMap = platformBuckets.get(platform);
        if (!pMap) {
            pMap = new Map<string, BucketAcc>();
            platformBuckets.set(platform, pMap);
        }
        const pAcc = pMap.get(key) || { dayOfWeek, hour, samples: 0, totalEngagement: 0 };
        pAcc.samples += 1;
        pAcc.totalEngagement += engagement;
        pMap.set(key, pAcc);
    }

    const overall = rankBuckets(overallBuckets, TOP_N_OVERALL);

    const byPlatform: Record<string, BestTimeSlot[]> = {};
    for (const [platform, pMap] of platformBuckets.entries()) {
        const ranked = rankBuckets(pMap, TOP_N_PER_PLATFORM);
        if (ranked.length > 0) byPlatform[platform] = ranked;
    }

    // If nothing cleared the per-bucket sample minimum, fall back gracefully.
    if (overall.length === 0) {
        return {
            overall: industryDefaults().slice(0, TOP_N_OVERALL * 2),
            byPlatform,
            fallback: true,
            analyzedPosts,
        };
    }

    return {
        overall,
        byPlatform,
        fallback: false,
        analyzedPosts,
    };
}
