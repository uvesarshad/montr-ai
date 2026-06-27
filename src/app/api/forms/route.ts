import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import { nanoid } from 'nanoid';

export async function GET(_req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const forms = await FormModel.find({ userId: session.user.id })
            .sort({ updatedAt: -1 })
            .select('title isPublished views submissionsCount updatedAt slug');

        return NextResponse.json(forms);
    } catch (error) {
        console.error('Error fetching forms:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        // Check plan limit before creating form
        const { checkPlanLimit } = await import('@/lib/plan-enforcement');
        const userId = session.user.id!;
        const canCreate = await checkPlanLimit(userId, 'forms', 'maxForms');

        // Resolve organizationId for multi-tenancy (non-blocking if missing)
        if (!canCreate.allowed) {
            return NextResponse.json({
                error: 'Plan limit reached',
                message: canCreate.message,
                current: canCreate.current,
                limit: canCreate.limit,
                upgradeRequired: true
            }, { status: 403 });
        }

        // Parse request body for optional templateId
        let templateId: string | undefined;
        try {
            const body = await req.json();
            templateId = body.templateId;
        } catch {
            // No body or invalid JSON, proceed with blank form
        }

        // Load template if specified
        let template;
        if (templateId) {
            const { getTemplateById } = await import('@/lib/forms/templates');
            template = getTemplateById(templateId);
            if (!template) {
                return NextResponse.json({ error: 'Template not found' }, { status: 404 });
            }
        }

        // Generate a unique slug (nano id)
        const slug = nanoid(10);

        const newForm = await FormModel.create({
            userId: session.user.id,
            title: template?.title || 'Untitled Form',
            slug: slug,
            content: template?.content || '', // Use template content or start empty
            settings: {
                theme: template?.settings.theme || 'default',
                emailNotifications: template?.settings.emailNotifications || false,
                submitButtonText: template?.settings.submitButtonText || 'Submit',
                thankYouMessage: template?.settings.thankYouMessage || 'Thank you for your submission!',
            }
        });

        return NextResponse.json(newForm);
    } catch (error) {
        console.error('Error creating form:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
