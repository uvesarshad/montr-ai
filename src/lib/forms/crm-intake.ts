import mongoose from 'mongoose';
import { resolveContact } from '@/lib/identity';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import FormSubmissionModel from '@/lib/db/models/form-submission.model';
import { publishDomainEvent } from '@/lib/events/domain-bus';

interface CrmIntegrationSettings {
    enabled: boolean;
    fieldMap: {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        company?: string;
        jobTitle?: string;
    };
}

/**
 * Route a form submission through the X2 identity resolver (B3-1.1) and
 * write a `form_submission` activity row that surfaces in the unified
 * contact timeline (B3-4.5.1, B3-4.5.2).
 *
 * Silently no-ops when:
 *   - crmIntegration is disabled on the form
 *   - ownerId is not a valid ObjectId (legacy userId formats)
 *   - the submission has no identifiable email or phone
 */
export async function ingestFormSubmissionToCrm(params: {
    brandId?: string | null;
    formId: string;
    formTitle: string;
    ownerId: string;
    crmIntegration: CrmIntegrationSettings;
    submissionData: Record<string, unknown>;
    /** When provided, the resolver writes the resolved contactId back onto the submission row. */
    submissionId?: string;
}): Promise<{ contactId?: string }> {
    const { brandId, formId, formTitle, ownerId, crmIntegration, submissionData, submissionId } = params;

    if (!crmIntegration.enabled) return {};
    if (!mongoose.isValidObjectId(ownerId)) return {};

    const { fieldMap } = crmIntegration;

    const firstName = readField(submissionData, fieldMap.firstName);
    const lastName = readField(submissionData, fieldMap.lastName);
    const email = readField(submissionData, fieldMap.email);
    const phone = readField(submissionData, fieldMap.phone);
    const jobTitle = readField(submissionData, fieldMap.jobTitle);

    if (!email && !phone) return {};

    // X2 resolver: find existing CRM contact across all channels or create one.
    const resolution = await resolveContact({
        brandId,
        email,
        phone,
        createIfMissing: true,
        createdById: ownerId,
        source: 'form',
        defaults: {
            firstName,
            lastName,
            sourceDetails: { formId, formTitle, fieldMap },
        },
    });

    if (!resolution.contact) return {};

    // Link the form submission back to the resolved contact for the unified
    // timeline (B3-4.5.2) and the contact-detail Forms tab.
    if (submissionId && mongoose.isValidObjectId(submissionId)) {
        await FormSubmissionModel.updateOne(
            { _id: submissionId },
            { $set: { contactId: resolution.contact._id } },
        ).catch(() => undefined);
    }

    // Apply optional job title only when missing (don't overwrite richer data).
    if (jobTitle && !resolution.contact.jobTitle) {
        resolution.contact.jobTitle = jobTitle;
        await resolution.contact.save().catch(() => undefined);
    }

    // Activity row for the unified timeline (B3-4.5.2). The activity model
    // already has `form_submission` as a built-in ActivityType.
    await activityRepository
        .create({
            type: 'form_submission',
            targetType: 'contact',
            targetId: String(resolution.contact._id),
            contactId: String(resolution.contact._id),
            subject: formTitle ? `Form: ${formTitle}` : 'Form submission',
            body: serializeForActivityBody(submissionData),
            createdById: ownerId,
        })
        .catch(err => {
            // Activity creation failure shouldn't roll back the contact resolution.
            console.error('Form submission activity creation failed:', err);
        });

    publishDomainEvent({
        type: 'form.submitted',
        brandId: brandId ?? undefined,
        source: 'forms.crmIntake',
        payload: {
            formId,
            formTitle,
            contactId: String(resolution.contact._id),
            contactCreated: resolution.created,
            submissionId,
        },
    });

    return { contactId: String(resolution.contact._id) };
}

function readField(data: Record<string, unknown>, key: string | undefined): string | undefined {
    if (!key) return undefined;
    const raw = data[key];
    if (raw == null) return undefined;
    const s = String(raw).trim();
    return s || undefined;
}

function serializeForActivityBody(data: Record<string, unknown>): string {
    return Object.entries(data)
        .filter(([k]) => !k.startsWith('_')) // skip _honeypot, _formPassword, etc.
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join('\n');
}
