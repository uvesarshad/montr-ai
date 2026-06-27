/**
 * Cross-Channel Analytics Service
 *
 * Aggregates performance data from Social, Email, WhatsApp, and CRM
 * into a single report used by the Marketing Agent for plan iteration.
 */

import { analyticsRepository } from '@/lib/db/repository/analytics.repository';
import { buildPerformancePulse } from '@/lib/social/analytics-insights';
import MarketingCampaign from '@/lib/db/models/marketing-email/campaign.model';
import WhatsAppCampaign, { IWhatsAppCampaign } from '@/lib/db/models/whatsapp-campaign.model';
import { dbConnect } from '@/lib/db/connect';

// ── Types ──────────────────────────────────────────────────

export interface CrossChannelReport {
    period: '7d' | '30d' | '90d';
    generatedAt: string;
    social: {
        totalPosts: number;
        totalEngagement: number;
        avgEngagementRate: number;
        momentum: number;
        topPlatform: string | null;
        topPostPreview: string | null;
    };
    email: {
        campaignsSent: number;
        totalSent: number;
        totalOpened: number;
        totalClicked: number;
        totalBounced: number;
        avgOpenRate: number;
        avgClickRate: number;
    };
    whatsapp: {
        campaignsSent: number;
        totalSent: number;
        totalDelivered: number;
        totalRead: number;
        totalFailed: number;
        deliveryRate: number;
        readRate: number;
    };
    summary: string;
}

type PeriodKey = '7d' | '30d' | '90d';

// ── Helpers ────────────────────────────────────────────────

function periodToDays(period: PeriodKey): number {
    return period === '7d' ? 7 : period === '90d' ? 90 : 30;
}

function dateRange(period: PeriodKey): { from: Date; to: Date } {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - periodToDays(period));
    return { from, to };
}

function pct(numerator: number, denominator: number): number {
    if (denominator <= 0) return 0;
    return Math.round((numerator / denominator) * 10000) / 100;
}

// ── Service ────────────────────────────────────────────────

export class CrossChannelAnalyticsService {
    /**
     * Build a unified report for a brand across all channels.
     */
    static async getReport(
        brandId: string,
        organizationId: string,
        period: PeriodKey = '30d',
    ): Promise<CrossChannelReport> {
        await dbConnect();

        const { from, to } = dateRange(period);

        // Run all channel aggregations in parallel
        const [socialData, emailData, whatsappData] = await Promise.all([
            this.getSocialData(brandId, from, to, period),
            this.getEmailData(from, to),
            this.getWhatsAppData(from, to),
        ]);

        const summary = this.buildSummary(socialData, emailData, whatsappData, period);

        return {
            period,
            generatedAt: new Date().toISOString(),
            social: socialData,
            email: emailData,
            whatsapp: whatsappData,
            summary,
        };
    }

    // ── Social ─────────────────────────────────────────────

    private static async getSocialData(
        brandId: string,
        from: Date,
        to: Date,
        period: PeriodKey,
    ) {
        try {
            const [summary, trends, platforms, posts] = await Promise.all([
                analyticsRepository.getSummary(brandId, from, to),
                analyticsRepository.getTrends(brandId, from, to),
                analyticsRepository.getPlatformComparison(brandId, from, to),
                analyticsRepository.getByBrand(brandId, { fromDate: from, toDate: to, limit: 20 }),
            ]);

            const pulse = buildPerformancePulse({
                summary: {
                    totalPosts: summary.totalPosts,
                    totalLikes: summary.totalLikes,
                    totalComments: summary.totalComments,
                    totalShares: summary.totalShares,
                    totalReach: summary.totalReach,
                    totalImpressions: summary.totalImpressions,
                    avgEngagementRate: summary.avgEngagementRate,
                },
                trends,
                platforms: platforms.map(p => ({
                    platform: p.platform,
                    posts: p.posts,
                    avgLikes: p.avgLikes,
                    avgComments: p.avgComments,
                    avgShares: p.avgShares,
                    avgEngagementRate: p.avgEngagementRate,
                })),
                posts: posts.map(p => ({
                    _id: p._id?.toString() || '',
                    platform: p.platform,
                    publishedAt: p.publishedAt?.toISOString() || '',
                    contentPreview: p.contentPreview || '',
                    hasMedia: p.hasMedia ?? false,
                    metrics: p.metrics,
                })),
                rangeDays: periodToDays(period),
            });

            const topPost = summary.topPosts?.[0];

            return {
                totalPosts: summary.totalPosts,
                totalEngagement: pulse.totalEngagement,
                avgEngagementRate: summary.avgEngagementRate,
                momentum: pulse.momentum,
                topPlatform: pulse.topPlatform,
                topPostPreview: topPost?.contentPreview?.slice(0, 120) || null,
            };
        } catch (error) {
            console.warn('[CrossChannelAnalytics] Social data unavailable:', error);
            return {
                totalPosts: 0,
                totalEngagement: 0,
                avgEngagementRate: 0,
                momentum: 0,
                topPlatform: null,
                topPostPreview: null,
            };
        }
    }

    // ── Email ──────────────────────────────────────────────

    private static async getEmailData(from: Date, to: Date) {
        try {
            const campaigns = await MarketingCampaign.find({
                status: { $in: ['sent', 'completed'] },
                completedAt: { $gte: from, $lte: to },
            }).lean();

            let totalSent = 0;
            let totalOpened = 0;
            let totalClicked = 0;
            let totalBounced = 0;

            for (const c of campaigns) {
                totalSent += c.stats?.sent || 0;
                totalOpened += c.stats?.opened || 0;
                totalClicked += c.stats?.clicked || 0;
                totalBounced += c.stats?.bounced || 0;
            }

            return {
                campaignsSent: campaigns.length,
                totalSent,
                totalOpened,
                totalClicked,
                totalBounced,
                avgOpenRate: pct(totalOpened, totalSent),
                avgClickRate: pct(totalClicked, totalSent),
            };
        } catch (error) {
            console.warn('[CrossChannelAnalytics] Email data unavailable:', error);
            return {
                campaignsSent: 0,
                totalSent: 0,
                totalOpened: 0,
                totalClicked: 0,
                totalBounced: 0,
                avgOpenRate: 0,
                avgClickRate: 0,
            };
        }
    }

    // ── WhatsApp ───────────────────────────────────────────

    private static async getWhatsAppData(from: Date, to: Date) {
        try {
            const campaigns = await WhatsAppCampaign.find({
                status: { $in: ['completed', 'sending'] },
                completedAt: { $gte: from, $lte: to },
            }).lean();

            let totalSent = 0;
            let totalDelivered = 0;
            let totalRead = 0;
            let totalFailed = 0;

            for (const c of campaigns as unknown as IWhatsAppCampaign[]) {
                totalSent += c.stats?.sent || 0;
                totalDelivered += c.stats?.delivered || 0;
                totalRead += c.stats?.read || 0;
                totalFailed += c.stats?.failed || 0;
            }

            return {
                campaignsSent: campaigns.length,
                totalSent,
                totalDelivered,
                totalRead,
                totalFailed,
                deliveryRate: pct(totalDelivered, totalSent),
                readRate: pct(totalRead, totalDelivered),
            };
        } catch (error) {
            console.warn('[CrossChannelAnalytics] WhatsApp data unavailable:', error);
            return {
                campaignsSent: 0,
                totalSent: 0,
                totalDelivered: 0,
                totalRead: 0,
                totalFailed: 0,
                deliveryRate: 0,
                readRate: 0,
            };
        }
    }

    // ── Summary Builder ────────────────────────────────────

    private static buildSummary(
        social: CrossChannelReport['social'],
        email: CrossChannelReport['email'],
        whatsapp: CrossChannelReport['whatsapp'],
        period: PeriodKey,
    ): string {
        const parts: string[] = [`Cross-channel report for the last ${periodToDays(period)} days.`];

        // Social
        if (social.totalPosts > 0) {
            parts.push(
                `Social: ${social.totalPosts} posts, ${social.totalEngagement} engagements, ` +
                `${social.avgEngagementRate.toFixed(1)}% avg rate, momentum ${social.momentum > 0 ? '+' : ''}${social.momentum}%.` +
                (social.topPlatform ? ` Top platform: ${social.topPlatform}.` : ''),
            );
        } else {
            parts.push('Social: No published posts in this period.');
        }

        // Email
        if (email.campaignsSent > 0) {
            parts.push(
                `Email: ${email.campaignsSent} campaigns, ${email.avgOpenRate}% open rate, ${email.avgClickRate}% click rate.`,
            );
        } else {
            parts.push('Email: No campaigns completed in this period.');
        }

        // WhatsApp
        if (whatsapp.campaignsSent > 0) {
            parts.push(
                `WhatsApp: ${whatsapp.campaignsSent} campaigns, ${whatsapp.deliveryRate}% delivery, ${whatsapp.readRate}% read rate.`,
            );
        } else {
            parts.push('WhatsApp: No campaigns in this period.');
        }

        return parts.join('\n');
    }
}
