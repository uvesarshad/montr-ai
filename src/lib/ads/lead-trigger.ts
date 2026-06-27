/**
 * Fires the `ad_lead_captured` workflow trigger after a lead is stored and
 * the automatic CRM intake has run (so the payload carries the outcome).
 *
 * Fire-and-forget: a trigger-dispatch failure must never fail the webhook —
 * Meta/Google judge our endpoint health by status codes.
 */
import { dispatchTrigger } from '@/lib/workflow/triggers/dispatch';
import type { IAdLead } from '@/lib/db/models/ad-lead.model';

export async function fireAdLeadCapturedTrigger(
    lead: IAdLead,
    intake: { status: string; contactId?: string },
): Promise<void> {
    try {
        const result = await dispatchTrigger({
            kind: 'ad_lead_captured',
            brandId: lead.brandId,
            leadId: String(lead._id),
            platform: lead.platform,
            campaignId: lead.campaignId,
            campaignName: lead.campaignName,
            formId: lead.formId,
            email: lead.email,
            phone: lead.phone,
            firstName: lead.firstName,
            lastName: lead.lastName,
            fields: lead.fields,
            syncStatus: intake.status,
            contactId: intake.contactId,
        });
        if (result.enqueued > 0) {
            console.log(`[Ad Lead Trigger] ${result.enqueued} workflow(s) enqueued for lead ${lead._id}`);
        }
    } catch (error) {
        console.error(`[Ad Lead Trigger] Dispatch failed for lead ${lead._id}:`, error);
    }
}
