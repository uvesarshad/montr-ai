import { z } from 'zod';

/**
 * Campaign-creation wizard payloads. Platform constraints are enforced
 * here so the API rejects out-of-spec assets before any platform call.
 */

const campaignName = z.string().trim().min(1).max(120);

export const metaCampaignCreateSchema = z.object({
    platform: z.literal('meta_ads'),
    /** Our AdAccount._id (ownership is verified server-side) */
    adAccountId: z.string().min(1),
    campaign: z.object({
        name: campaignName,
        objective: z.enum(['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_AWARENESS']),
    }),
    adset: z.object({
        name: campaignName,
        /** Major currency units per day */
        dailyBudget: z.number().positive().max(1_000_000),
        countries: z.array(z.string().length(2)).min(1).max(25),
        ageMin: z.number().int().min(18).max(65).optional(),
        ageMax: z.number().int().min(18).max(65).optional(),
    }).refine(
        (value) => value.ageMin === undefined || value.ageMax === undefined || value.ageMin <= value.ageMax,
        { message: 'ageMin must be ≤ ageMax' },
    ),
    ad: z.object({
        name: campaignName,
        pageId: z.string().min(1),
        primaryText: z.string().trim().min(1).max(1000),
        headline: z.string().trim().max(255).optional(),
        description: z.string().trim().max(255).optional(),
        linkUrl: z.string().url(),
        imageUrl: z.string().url().optional(),
    }),
});

export const googleCampaignCreateSchema = z.object({
    platform: z.literal('google_ads'),
    adAccountId: z.string().min(1),
    campaign: z.object({
        name: campaignName,
        dailyBudget: z.number().positive().max(1_000_000),
    }),
    adGroup: z.object({
        name: campaignName,
        keywords: z.array(z.string().trim().min(1).max(80)).max(50),
    }),
    rsa: z.object({
        // Google RSA hard limits
        headlines: z.array(z.string().trim().min(1).max(30)).min(3).max(15),
        descriptions: z.array(z.string().trim().min(1).max(90)).min(2).max(4),
        finalUrl: z.string().url(),
    }),
});

export const adsCampaignCreateSchema = z.discriminatedUnion('platform', [
    metaCampaignCreateSchema,
    googleCampaignCreateSchema,
]);

export type MetaCampaignCreate = z.infer<typeof metaCampaignCreateSchema>;
export type GoogleCampaignCreate = z.infer<typeof googleCampaignCreateSchema>;
export type AdsCampaignCreate = z.infer<typeof adsCampaignCreateSchema>;
