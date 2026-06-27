// OSS single-tenant override of src/lib/identity/backfill/brand-id.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
/**
 * B3-4.6.5 — Default-brand backfill.
 *
 * Walks the records across CRM/inbox/WhatsApp and assigns
 * `brandId = defaultBrandId` to every row where `brandId` is null/missing.
 * Dry-run mode supported.
 *
 * Run once during the agency-mode rollout. Subsequent ingest paths
 * (resolver, inbox channel create, etc.) carry brandId from the moment the
 * top-nav picker has a value.
 */

import mongoose, { Types } from 'mongoose';
import CrmContact from '@/lib/db/models/crm/contact.model';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import InboxMessage from '@/lib/db/models/inbox-message.model';
import WhatsAppAccount from '@/lib/db/models/whatsapp-account.model';
import WhatsAppConversation from '@/lib/db/models/whatsapp-conversation.model';
import WhatsAppMessage from '@/lib/db/models/whatsapp-message.model';
import WhatsAppTemplate from '@/lib/db/models/whatsapp-template.model';
import WhatsAppCampaign from '@/lib/db/models/whatsapp-campaign.model';
import FormSubmissionModel from '@/lib/db/models/form-submission.model';
import FormModel from '@/lib/db/models/form.model';

export interface BrandBackfillOptions {
    defaultBrandId: string;
    dryRun?: boolean;
}

export interface BrandBackfillReport {
    perModel: Record<string, { matched: number; updated: number }>;
    totalUpdated: number;
}

async function ensureConnection() {
    if (mongoose.connection.readyState !== 1) {
        const { connectMongoose } = await import('@/lib/mongodb');
        await connectMongoose();
    }
}

export async function backfillDefaultBrand(opts: BrandBackfillOptions): Promise<BrandBackfillReport> {
    await ensureConnection();

    const brandIdObj = new Types.ObjectId(opts.defaultBrandId);
    const brandIdStr = opts.defaultBrandId;

    // Models with brandId stored as ObjectId.
    const objectIdModels = [
        { name: 'CrmContact', model: CrmContact },
        { name: 'InboxChannel', model: InboxChannel },
        { name: 'InboxConversation', model: InboxConversation },
        { name: 'InboxMessage', model: InboxMessage },
        { name: 'WhatsAppAccount', model: WhatsAppAccount },
        { name: 'WhatsAppConversation', model: WhatsAppConversation },
        { name: 'WhatsAppMessage', model: WhatsAppMessage },
        { name: 'WhatsAppTemplate', model: WhatsAppTemplate },
        { name: 'WhatsAppCampaign', model: WhatsAppCampaign },
    ];

    // Models with brandId stored as string (legacy Form / FormSubmission).
    const stringIdModels = [
        { name: 'Form', model: FormModel },
        { name: 'FormSubmission', model: FormSubmissionModel },
    ];

    const perModel: BrandBackfillReport['perModel'] = {};
    let totalUpdated = 0;

    for (const { name, model } of objectIdModels) {
        const filter = {
            $or: [{ brandId: { $exists: false } }, { brandId: null }],
        };
        const matched = await model.countDocuments(filter).exec();
        let updated = 0;
        if (!opts.dryRun && matched > 0) {
            const res = await model.updateMany(filter, { $set: { brandId: brandIdObj } }).exec();
            updated = res.modifiedCount;
        }
        perModel[name] = { matched, updated };
        totalUpdated += updated;
    }

    for (const { name, model } of stringIdModels) {
        const filter = {
            $or: [{ brandId: { $exists: false } }, { brandId: null }],
        };
        const matched = await model.countDocuments(filter).exec();
        let updated = 0;
        if (!opts.dryRun && matched > 0) {
            const res = await model.updateMany(filter, { $set: { brandId: brandIdStr } }).exec();
            updated = res.modifiedCount;
        }
        perModel[name] = { matched, updated };
        totalUpdated += updated;
    }

    return { perModel, totalUpdated };
}
