/**
 * Campaign-creation orchestration — drives the allowlisted write-ops in
 * order (campaign → ad set/group → ad) for one validated wizard spec.
 *
 * Everything is created PAUSED; a partial failure reports exactly which
 * step failed and what already exists so the user can finish or clean up
 * in the native platform UI (we never auto-delete — create-only).
 */
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { getFreshAdAccountToken } from '@/lib/ads/token-refresh';
import {
    createGoogleAdGroup,
    createGoogleCampaign,
    createGoogleRsa,
    createMetaAd,
    createMetaAdSet,
    createMetaCampaign,
    type WriteContext,
} from '@/lib/ads/write-ops';
import type { AdsCampaignCreate } from '@/validations/ads-campaign';

export interface CampaignCreationResult {
    status: 'created' | 'partial';
    platform: AdsCampaignCreate['platform'];
    /** Platform IDs created so far, keyed by entity */
    entities: Record<string, string>;
    failedStep?: string;
    error?: string;
}

export async function createCampaignFromSpec(params: {
    userId: string;
    spec: AdsCampaignCreate;
}): Promise<CampaignCreationResult> {
    const { userId, spec } = params;

    const account = await adAccountRepository.findById(spec.adAccountId);
    if (!account) {
        throw new Error('Ad account not found');
    }
    if (account.platform !== spec.platform) {
        throw new Error('Ad account does not match the requested platform');
    }
    if (!account.isActive) {
        throw new Error('Ad account is disconnected');
    }

    const { accessToken } = await getFreshAdAccountToken(spec.adAccountId);
    const context: WriteContext = {
        userId,
        brandId: account.brandId,
        account,
        accessToken,
    };

    const entities: Record<string, string> = {};

    const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
        try {
            return await run();
        } catch (error) {
            throw Object.assign(
                new Error(error instanceof Error ? error.message : String(error)),
                { failedStep: name },
            );
        }
    };

    try {
        if (spec.platform === 'meta_ads') {
            const campaign = await step('campaign', () => createMetaCampaign(context, spec.campaign));
            entities.campaignId = campaign.id;

            const adset = await step('adset', () => createMetaAdSet(context, campaign.id, spec.adset));
            entities.adsetId = adset.id;

            const ad = await step('ad', () => createMetaAd(context, adset.id, spec.ad));
            entities.adId = ad.adId;
            entities.creativeId = ad.creativeId;
        } else {
            const campaign = await step('campaign', () => createGoogleCampaign(context, spec.campaign));
            entities.campaignId = campaign.campaignId;
            entities.campaignResourceName = campaign.campaignResourceName;

            const adGroup = await step('ad_group', () =>
                createGoogleAdGroup(context, campaign.campaignResourceName, spec.adGroup));
            entities.adGroupResourceName = adGroup.adGroupResourceName;

            const rsa = await step('rsa', () => createGoogleRsa(context, adGroup.adGroupResourceName, spec.rsa));
            entities.adResourceName = rsa.adResourceName;
        }

        await adAccountRepository.markUsed(spec.adAccountId);
        return { status: 'created', platform: spec.platform, entities };
    } catch (error) {
        const failedStep = (error as { failedStep?: string }).failedStep || 'unknown';
        const message = error instanceof Error ? error.message : String(error);
        return {
            status: 'partial',
            platform: spec.platform,
            entities,
            failedStep,
            error: message,
        };
    }
}
