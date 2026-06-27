/**
 * Ads Write Tools (Phase 2, 2026-06-05 — decision D1)
 *
 * Extends the ads write guardrail's "explicit user action" to an approved
 * HITL card: the agent DRAFTS a full campaign spec as the tool args, the
 * approval card shows every field (budget, audience, creative, URLs), and
 * only on the user's approval does the call reach the existing write-ops
 * allowlist — which stays create-only with campaign status hardcoded to
 * PAUSED and every write audited. The user still activates the campaign in
 * the native wizard/platform. Nothing here can update, delete, or unpause.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { adsCampaignCreateSchema } from '@/validations/ads-campaign';

// ─── list_ad_accounts ─────────────────────────────────────────────────────────

export const listAdAccountsTool = {
    name: 'list_ad_accounts',
    description: 'List the connected ad accounts (Google Ads / Meta Ads) for this brand — names, platforms, currencies. Use the account ID in create_ad_campaign.',
    parameters: z.object({}),
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'List connected ad accounts for the brand.',
        parameters: z.object({}),
        execute: async () => {
            try {
                const accounts = context.brandId
                    ? await adAccountRepository.findByBrandId(context.brandId)
                    : [];
                return {
                    success: true,
                    total: accounts.length,
                    accounts: accounts.map((a) => ({
                        id: a._id.toString(),
                        platform: a.platform,
                        accountName: a.accountName,
                        externalAccountId: a.externalAccountId,
                        currencyCode: a.currencyCode,
                        timezone: a.timezone,
                        isActive: a.isActive,
                    })),
                    note: accounts.length === 0
                        ? 'No ad accounts connected for this brand. Point the user to Ads ▸ Connections.'
                        : undefined,
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── create_ad_campaign ───────────────────────────────────────────────────────
// The tool's parameters ARE the validated wizard schema — the approval card
// renders them, and a 400-style mismatch is impossible because the same zod
// schema gates both this tool and POST /api/v2/ads/campaigns.

// Tool parameters MUST be a plain object schema: a zod discriminatedUnion at
// the root converts to a top-level `anyOf` JSON schema, which Gemini's
// function-calling API rejects — and one rejected declaration 400s the WHOLE
// tool-carrying request. So the params are a flattened superset and the
// canonical adsCampaignCreateSchema validates inside execute.
const createAdCampaignParams = z.object({
    platform: z.enum(['meta_ads', 'google_ads']),
    adAccountId: z.string().min(1).describe('Our ad account id from list_ad_accounts.'),
    campaign: z.object({
        name: z.string().min(1).max(120),
        objective: z.enum(['OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_AWARENESS']).optional()
            .describe('Meta only.'),
        dailyBudget: z.number().positive().optional().describe('Google only — major currency units per day.'),
    }),
    adset: z.object({
        name: z.string().min(1).max(120),
        dailyBudget: z.number().positive().describe('Major currency units per day.'),
        countries: z.array(z.string().length(2)).min(1).max(25).describe('ISO-2 country codes.'),
        ageMin: z.number().int().min(18).max(65).optional(),
        ageMax: z.number().int().min(18).max(65).optional(),
    }).optional().describe('Meta only.'),
    ad: z.object({
        name: z.string().min(1).max(120),
        pageId: z.string().min(1),
        primaryText: z.string().min(1).max(1000),
        headline: z.string().max(255).optional(),
        description: z.string().max(255).optional(),
        linkUrl: z.string().url(),
        imageUrl: z.string().url().optional(),
    }).optional().describe('Meta only.'),
    adGroup: z.object({
        name: z.string().min(1).max(120),
        keywords: z.array(z.string().min(1).max(80)).max(50),
    }).optional().describe('Google only.'),
    rsa: z.object({
        headlines: z.array(z.string().min(1).max(30)).min(3).max(15),
        descriptions: z.array(z.string().min(1).max(90)).min(2).max(4),
        finalUrl: z.string().url(),
    }).optional().describe('Google only.'),
});

export const createAdCampaignTool = {
    name: 'create_ad_campaign',
    description: `Create a PAUSED ad campaign from a complete draft. ALWAYS requires the user's approval — the approval card shows the full draft (platform, account, budget, targeting, creative). The campaign is created PAUSED; the user activates it themselves. Ground budgets in get_ads_insights data. Rules:
- Google: campaign.dailyBudget + adGroup + rsa (3-15 headlines ≤30 chars, 2-4 descriptions ≤90 chars, keywords ≤50).
- Meta: campaign.objective + adset + ad (ISO-2 country codes, page ID required).
Get the adAccountId from list_ad_accounts first.`,
    parameters: createAdCampaignParams,
    hitlPolicy: 'always' as const,
    factory: (context: AgentContext) => tool({
        description: 'Create a PAUSED ad campaign (gated — requires approval).',
        parameters: createAdCampaignParams,
        execute: async (args) => {
            try {
                // Plan gate (A3) — ads writes are a paid-tier feature. Checked at
                // execute time (post-approval) so a plan downgrade between draft
                // and approval still blocks the write.
                const { checkAgentGate } = await import('../plan-gate');
                const gate = await checkAgentGate({ userId: context.userId });
                if (!gate.allowAdsWrite) {
                    return {
                        success: false,
                        error: 'Ad campaign creation is not included in your current plan. The draft is saved in this conversation — upgrade your plan to let the agent create campaigns, or build it yourself in Ads ▸ Campaigns.',
                    };
                }

                // Canonical validation — the same schema that gates the wizard API.
                const parsed = adsCampaignCreateSchema.safeParse(args);
                if (!parsed.success) {
                    return {
                        success: false,
                        error: `Draft is incomplete for ${args.platform}: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
                    };
                }
                const spec = parsed.data;

                // Defense in depth: the account must belong to this org AND
                // (when the mission is brand-scoped) to this brand.
                const account = await adAccountRepository.findById(spec.adAccountId);
                if (!account) {
                    return { success: false, error: 'Ad account not found in this organization.' };
                }
                if (context.brandId && account.brandId !== context.brandId) {
                    return { success: false, error: 'Ad account belongs to a different brand.' };
                }

                const { createCampaignFromSpec } = await import('@/lib/ads/campaign-creation');
                const result = await createCampaignFromSpec({
                    userId: context.userId,
                    spec,
                });

                if (result.status === 'created') {
                    return {
                        success: true,
                        status: 'created',
                        platform: result.platform,
                        entities: result.entities,
                        message: 'Campaign created PAUSED. Tell the user to review and activate it in Ads ▸ Campaigns (or the native platform).',
                        deepLink: '/ads',
                    };
                }

                return {
                    success: false,
                    status: 'partial',
                    platform: result.platform,
                    entities: result.entities,
                    failedStep: result.failedStep,
                    error: `Creation failed at step "${result.failedStep}": ${result.error}. Entities already created (all PAUSED): ${JSON.stringify(result.entities)}. We never auto-delete — the user can finish or clean up in the platform UI.`,
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

toolRegistry.register(listAdAccountsTool);
toolRegistry.register(createAdCampaignTool);
