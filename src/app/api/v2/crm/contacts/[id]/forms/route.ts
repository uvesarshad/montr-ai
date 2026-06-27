import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import FormModel from '@/lib/db/models/form.model';
import FormSubmissionModel from '@/lib/db/models/form-submission.model';

/**
 * GET /api/v2/crm/contacts/[id]/forms
 * Returns forms that have submissions matching the contact's email.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id } = await params;
        const userId = session.user.id!;

        assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');

        const user = await userRepository.findById(userId);
        if (!user) return NextResponse.json({ error: 'No organization' }, { status: 403 });
        await dbConnect();

        const contact = await contactRepository.findById(id);
        if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

        if (!contact.email) {
            return NextResponse.json({ forms: [] });
        }

        // Find submissions that include the contact's email in any field value
        const emailPattern = new RegExp(contact.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        // MongoDB: query for submissions where any data field matches the email
        const submissions = await FormSubmissionModel.find({
            $or: [
                { },
                // Fall back to owner's forms for submissions before organizationId was added
            ],
        })
            .select('formId data createdAt')
            .lean();

        // Filter client-side for email match across all data fields
        const matched = submissions.filter(sub => {
            if (!sub.data) return false;
            return Object.values(sub.data).some(
                val => typeof val === 'string' && emailPattern.test(val)
            );
        });

        if (matched.length === 0) {
            return NextResponse.json({ forms: [] });
        }

        // Deduplicate by formId and fetch form details
        const formIdSet = new Set(matched.map(s => s.formId.toString()));
        const formIds = [...formIdSet];

        const forms = await FormModel.find({
            _id: { $in: formIds },
            userId,
        })
            .select('title slug isPublished submissionsCount createdAt updatedAt')
            .lean();

        // Attach the latest matching submission per form
        const result = forms.map(form => {
            const formSubmissions = matched
                .filter(s => s.formId.toString() === form._id.toString())
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            return {
                ...form,
                latestSubmission: formSubmissions[0] ?? null,
                submissionCount: formSubmissions.length,
            };
        });

        return NextResponse.json({ forms: result });
    } catch (error) {
        const permResp = crmErrorResponse(error);
        if (permResp) return permResp;
        console.error('Error fetching contact forms:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
