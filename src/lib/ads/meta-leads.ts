/**
 * Meta Lead Ads webhook processing.
 *
 * A `leadgen` webhook only carries IDs — the actual answers are fetched
 * from /{leadgen_id} (requires leads_retrieval / ads_management). Token
 * resolution order:
 *   1. The connected Facebook Page (SocialAccount) matching the webhook's
 *      page_id — page tokens can read their page's leads.
 *   2. Any active connected Meta ad account — the long-lived user token
 *      can read leads of ads in its ad accounts. The first token that
 *      successfully fetches the lead attributes the org/brand.
 */
import crypto from 'crypto';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { adLeadRepository } from '@/lib/db/repository/ad-lead.repository';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import { ingestAdLeadToCrm, extractIdentityFields } from '@/lib/ads/crm-intake';
import { fireAdLeadCapturedTrigger } from '@/lib/ads/lead-trigger';
import { META_ADS_GRAPH_BASE } from '@/lib/ads/meta-ads-oauth';

export interface MetaLeadgenValue {
    leadgen_id?: string;
    page_id?: string;
    form_id?: string;
    ad_id?: string;
    adgroup_id?: string;
    created_time?: number;
}

export function verifyMetaLeadsSignature(rawBody: string, signature: string | null): boolean {
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appSecret) {
        return process.env.NODE_ENV !== 'production';
    }

    if (!signature) return false;

    const expected = crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(`sha256=${expected}`),
        );
    } catch {
        return false;
    }
}

interface MetaLeadDetails {
    id?: string;
    created_time?: string;
    field_data?: { name?: string; values?: string[] }[];
    form_id?: string;
    ad_id?: string;
    adset_id?: string;
    campaign_id?: string;
    campaign_name?: string;
}

async function fetchLeadDetails(leadgenId: string, accessToken: string): Promise<MetaLeadDetails | null> {
    const url = new URL(`${META_ADS_GRAPH_BASE}/${leadgenId}`);
    url.searchParams.set('fields', 'id,created_time,field_data,form_id,ad_id,adset_id,campaign_id,campaign_name');
    url.searchParams.set('access_token', accessToken);

    const response = await fetch(url.toString());
    if (!response.ok) return null;
    return response.json();
}

function fieldDataToMap(fieldData: MetaLeadDetails['field_data']): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const entry of fieldData || []) {
        if (!entry.name) continue;
        fields[entry.name] = (entry.values || []).join(', ');
    }
    return fields;
}

/**
 * Process one leadgen webhook event. Never throws — webhook handlers must
 * always 200 or Meta disables the subscription.
 */
export async function processMetaLeadgenEvent(value: MetaLeadgenValue): Promise<void> {
    const leadgenId = value.leadgen_id;
    const pageId = value.page_id;
    if (!leadgenId) return;

    try {
        let details: MetaLeadDetails | null = null;
        let organizationId: string | undefined;
        let brandId: string | undefined;
        let adAccountId: string | undefined;

        // 1. Page token path
        if (pageId) {
            const pageAccounts = await socialAccountRepository.findByPlatformAccountId('facebook', pageId);
            if (pageAccounts) {
                const withTokens = await socialAccountRepository.findByIdWithTokens(pageAccounts._id.toString());
                if (withTokens) {
                    details = await fetchLeadDetails(leadgenId, withTokens.accessToken);
                    if (details) {
                        brandId = withTokens.account.brandId;
                        const brand = await brandRepository.findById(brandId);
                        organizationId = brand?.userId;
                    }
                }
            }
        }

        // 2. Connected Meta ad account fallback
        if (!details) {
            const metaAccounts = await adAccountRepository.findAllActive('meta_ads');
            for (const account of metaAccounts.slice(0, 25)) {
                const withTokens = await adAccountRepository.findByIdWithTokens(account._id.toString());
                if (!withTokens) continue;
                details = await fetchLeadDetails(leadgenId, withTokens.accessToken);
                if (details) {
                    organizationId = account.userId;
                    brandId = account.brandId;
                    adAccountId = account._id.toString();
                    break;
                }
            }
        }

        if (!details || !brandId) {
            console.warn(`[Meta Leads] Could not fetch/attribute lead ${leadgenId} (page ${pageId}) — no matching connection`);
            return;
        }

        const fields = fieldDataToMap(details.field_data);
        const identity = extractIdentityFields(fields);

        const lead = await adLeadRepository.createIfNew({
            brandId,
            platform: 'meta_ads',
            adAccountId,
            externalLeadId: leadgenId,
            campaignId: details.campaign_id || undefined,
            campaignName: details.campaign_name || undefined,
            adsetId: details.adset_id || undefined,
            adId: details.ad_id || value.ad_id || undefined,
            formId: details.form_id || value.form_id || undefined,
            pageId,
            fields,
            ...identity,
            receivedAt: details.created_time ? new Date(details.created_time) : new Date(),
        });

        if (!lead) return; // duplicate delivery

        const intake = await ingestAdLeadToCrm(lead);
        await fireAdLeadCapturedTrigger(lead, intake);
    } catch (error) {
        console.error(`[Meta Leads] Failed to process lead ${leadgenId}:`, error);
    }
}
