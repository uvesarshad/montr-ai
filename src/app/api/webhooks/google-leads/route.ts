import { NextRequest, NextResponse } from 'next/server';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { adLeadRepository } from '@/lib/db/repository/ad-lead.repository';
import { ingestAdLeadToCrm, extractIdentityFields } from '@/lib/ads/crm-intake';
import { fireAdLeadCapturedTrigger } from '@/lib/ads/lead-trigger';

/**
 * Google Ads lead form webhook.
 *
 * Configure on the lead form asset in Google Ads:
 *   Webhook URL:  {APP_URL}/api/webhooks/google-leads
 *   Google key:   the connected ad account's webhookKey (shown in
 *                 Ads ▸ Leads after connecting)
 *
 * Google delivers JSON like:
 * {
 *   lead_id, api_version, form_id, campaign_id, adgroup_id, creative_id,
 *   gcl_id, is_test, google_key,
 *   user_column_data: [{ column_name, string_value, column_id }]
 * }
 */

interface GoogleLeadColumn {
    column_name?: string;
    string_value?: string;
    column_id?: string;
}

interface GoogleLeadPayload {
    lead_id?: string;
    api_version?: string;
    form_id?: number | string;
    campaign_id?: number | string;
    adgroup_id?: number | string;
    creative_id?: number | string;
    gcl_id?: string;
    is_test?: boolean;
    google_key?: string;
    user_column_data?: GoogleLeadColumn[];
}

function columnsToFields(columns: GoogleLeadColumn[] | undefined): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const column of columns || []) {
        // column_id is the stable machine name (EMAIL, PHONE_NUMBER,
        // FULL_NAME, ...); column_name is the display label. Prefer the ID,
        // lowercased so it lines up with the identity extractor's keys.
        const key = (column.column_id || column.column_name || '').toLowerCase();
        if (!key) continue;
        const value = String(column.string_value ?? '').trim();
        if (value) fields[key] = value;
    }
    return fields;
}

export async function POST(req: NextRequest) {
    try {
        let payload: GoogleLeadPayload;
        try {
            payload = await req.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
        }

        if (!payload.google_key || !payload.lead_id) {
            return NextResponse.json({ error: 'Missing google_key or lead_id' }, { status: 400 });
        }

        // The key both authenticates the delivery and routes it to a connection
        const account = await adAccountRepository.findByWebhookKey(payload.google_key);
        if (!account || account.platform !== 'google_ads') {
            return NextResponse.json({ error: 'Unknown key' }, { status: 403 });
        }

        const fields = columnsToFields(payload.user_column_data);
        const identity = extractIdentityFields(fields);

        const lead = await adLeadRepository.createIfNew({
            brandId: account.brandId,
            platform: 'google_ads',
            adAccountId: account._id.toString(),
            externalLeadId: payload.lead_id,
            campaignId: payload.campaign_id !== undefined ? String(payload.campaign_id) : undefined,
            adsetId: payload.adgroup_id !== undefined ? String(payload.adgroup_id) : undefined,
            adId: payload.creative_id !== undefined ? String(payload.creative_id) : undefined,
            formId: payload.form_id !== undefined ? String(payload.form_id) : undefined,
            isTest: Boolean(payload.is_test),
            fields,
            ...identity,
        });

        if (lead) {
            const intake = await ingestAdLeadToCrm(lead);
            await fireAdLeadCapturedTrigger(lead, intake);
        }

        // Always 200 once authenticated — Google retries non-200 for days
        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Google leads webhook error:', error);
        return NextResponse.json({ received: true });
    }
}
