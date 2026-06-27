import mongoose from 'mongoose';
import { publishDomainEvent } from '@/lib/events/domain-bus';
import { resolveContact } from '@/lib/identity';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import { adLeadRepository } from '@/lib/db/repository/ad-lead.repository';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { adLeadFieldMapRepository, FieldMapValues } from '@/lib/db/repository/ad-lead-field-map.repository';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import type { IAdLead } from '@/lib/db/models/ad-lead.model';

/**
 * Ads → CRM bridge. Mirrors src/lib/forms/crm-intake.ts: route a captured
 * ad lead through the X2 identity resolver and write a timeline activity.
 * Touches the CRM only through the resolver + repositories — never the
 * CRM module itself (hard rule).
 */

const EMAIL_KEYS = ['email', 'e-mail', 'work_email', 'business_email', 'email_address'];
const PHONE_KEYS = ['phone', 'phone_number', 'mobile', 'mobile_number', 'telephone', 'whatsapp_number'];
const FIRST_NAME_KEYS = ['first_name', 'firstname', 'given_name'];
const LAST_NAME_KEYS = ['last_name', 'lastname', 'family_name', 'surname'];
const FULL_NAME_KEYS = ['full_name', 'fullname', 'name', 'your_name'];

function findField(fields: Record<string, string>, keys: string[]): string | undefined {
    for (const [rawKey, rawValue] of Object.entries(fields)) {
        const key = rawKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (keys.includes(key)) {
            const value = String(rawValue ?? '').trim();
            if (value) return value;
        }
    }
    return undefined;
}

export interface ExtractedIdentity {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
}

/** Case/format-insensitive lookup of one configured key in the answer map */
function readMappedField(fields: Record<string, string>, mappedKey?: string): string | undefined {
    if (!mappedKey) return undefined;
    const wanted = mappedKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
    for (const [rawKey, rawValue] of Object.entries(fields)) {
        const key = rawKey.trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (key === wanted) {
            const value = String(rawValue ?? '').trim();
            if (value) return value;
        }
    }
    return undefined;
}

/** Apply a per-form field map (configured in Ads ▸ Leads) over the answers */
export function applyFieldMap(fields: Record<string, string>, map: FieldMapValues): ExtractedIdentity {
    return {
        email: readMappedField(fields, map.email),
        phone: readMappedField(fields, map.phone),
        firstName: readMappedField(fields, map.firstName),
        lastName: readMappedField(fields, map.lastName),
    };
}

/**
 * Best-effort identity extraction from a platform answer map. Meta uses
 * snake_case standard names (email, phone_number, full_name); Google
 * column IDs are normalized to lowercase by the webhook before this runs.
 */
export function extractIdentityFields(fields: Record<string, string>): ExtractedIdentity {
    const email = findField(fields, EMAIL_KEYS);
    const phone = findField(fields, PHONE_KEYS);
    let firstName = findField(fields, FIRST_NAME_KEYS);
    let lastName = findField(fields, LAST_NAME_KEYS);

    if (!firstName && !lastName) {
        const fullName = findField(fields, FULL_NAME_KEYS);
        if (fullName) {
            const parts = fullName.split(/\s+/);
            firstName = parts[0];
            lastName = parts.slice(1).join(' ') || undefined;
        }
    }

    return { email, phone, firstName, lastName };
}

/** Surface a genuine sync failure to org admins via the notification bus */
function publishLeadSyncFailed(lead: IAdLead, error: string): void {
    publishDomainEvent({
        type: 'ads.lead_sync_failed',
        brandId: lead.brandId,
        source: 'ads.crmIntake',
        payload: {
            leadId: String(lead._id),
            platform: lead.platform,
            campaignName: lead.campaignName,
            email: lead.email,
            error,
        },
    });
}

/** Resolve a valid ObjectId user for the createdById audit field */
async function resolveCreatorId(lead: IAdLead): Promise<string | null> {
    if (lead.adAccountId) {
        const account = await adAccountRepository.findById(lead.adAccountId);
        if (account?.userId && mongoose.isValidObjectId(account.userId)) {
            return account.userId;
        }
    }
    const brand = await brandRepository.findById(lead.brandId);
    if (brand?.userId && mongoose.isValidObjectId(brand.userId)) {
        return brand.userId;
    }
    return null;
}

/**
 * Push one stored AdLead into the CRM. Updates the lead's status
 * (synced / skipped / failed) so the Ads ▸ Leads view can show the
 * mapping result and offer a retry. Safe to call repeatedly.
 */
export async function ingestAdLeadToCrm(lead: IAdLead): Promise<{ status: string; contactId?: string }> {
    const leadId = String(lead._id);

    try {
        if (lead.isTest) {
            await adLeadRepository.markSkipped(leadId, 'Test lead (form preview)');
            return { status: 'skipped' };
        }

        // Per-form mapping (configured in Ads ▸ Leads) wins over the
        // generic heuristics; the lead's stored extraction is the fallback.
        const formMap = lead.formId
            ? await adLeadFieldMapRepository.find(lead.platform, lead.formId)
            : null;
        const mapped = formMap ? applyFieldMap(lead.fields, formMap.fieldMap) : {};
        const identity = extractIdentityFields(lead.fields);

        const email = mapped.email || lead.email || identity.email;
        const phone = mapped.phone || lead.phone || identity.phone;
        const firstName = mapped.firstName || lead.firstName || identity.firstName;
        const lastName = mapped.lastName || lead.lastName || identity.lastName;

        if (!email && !phone) {
            await adLeadRepository.markSkipped(leadId, 'No identifiable email or phone in the lead fields');
            return { status: 'skipped' };
        }

        const creatorId = await resolveCreatorId(lead);
        if (!creatorId) {
            await adLeadRepository.markFailed(leadId, 'Could not resolve an owner user for contact creation');
            publishLeadSyncFailed(lead, 'Could not resolve an owner user for contact creation');
            return { status: 'failed' };
        }

        // X2 resolver: find existing CRM contact across all channels or create one.
        const resolution = await resolveContact({
            brandId: lead.brandId,
            email,
            phone,
            createIfMissing: true,
            createdById: creatorId,
            source: 'ads',
            defaults: {
                firstName,
                lastName,
                sourceDetails: {
                    platform: lead.platform,
                    campaignId: lead.campaignId,
                    campaignName: lead.campaignName,
                    adsetId: lead.adsetId,
                    adId: lead.adId,
                    formId: lead.formId,
                    formName: lead.formName,
                    externalLeadId: lead.externalLeadId,
                },
            },
        });

        if (!resolution.contact) {
            await adLeadRepository.markFailed(leadId, 'Identity resolver returned no contact');
            publishLeadSyncFailed(lead, 'Identity resolver returned no contact');
            return { status: 'failed' };
        }

        const contactId = String(resolution.contact._id);

        // Activity row for the unified timeline.
        await activityRepository
            .create({
                type: 'note',
                subtype: 'ad_lead',
                targetType: 'contact',
                targetId: contactId,
                contactId,
                subject: lead.campaignName
                    ? `Ad lead: ${lead.campaignName}`
                    : `Ad lead (${lead.platform === 'meta_ads' ? 'Meta Ads' : 'Google Ads'})`,
                body: Object.entries(lead.fields)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join('\n'),
                createdById: creatorId,
            })
            .catch((error) => {
                // Activity failure shouldn't roll back the contact resolution.
                console.error('Ad lead activity creation failed:', error);
            });

        await adLeadRepository.markSynced(leadId, contactId);

        // Phase 2 (2026-06-05): successful capture event for agent mission
        // triggers ("new ad lead → engagement mission").
        publishDomainEvent({
            type: 'ads.lead_captured',
            brandId: lead.brandId ? String(lead.brandId) : undefined,
            source: 'ads.crm-intake',
            payload: {
                leadId: String(lead._id ?? leadId),
                contactId,
                platform: lead.platform,
                campaignName: lead.campaignName,
            },
        });

        return { status: 'synced', contactId };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'CRM intake failed';
        console.error(`Ad lead ${leadId} CRM intake failed:`, error);
        await adLeadRepository.markFailed(leadId, message).catch(() => undefined);
        publishLeadSyncFailed(lead, message);
        return { status: 'failed' };
    }
}
