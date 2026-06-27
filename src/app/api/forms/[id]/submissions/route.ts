import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import FormSubmissionModel from '@/lib/db/models/form-submission.model';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        await dbConnect();

        // 1. Verify ownership of the form
        const form = await FormModel.findOne({ _id: id, userId: session.user.id });
        if (!form) {
            return NextResponse.json({ error: 'Form not found or unauthorized' }, { status: 404 });
        }

        // 2. Fetch submissions
        // Pagination params
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '50');
        const page = parseInt(searchParams.get('page') || '1');
        const skip = (page - 1) * limit;

        const [submissions, total] = await Promise.all([
            FormSubmissionModel.find({ formId: id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FormSubmissionModel.countDocuments({ formId: id })
        ]);

        return NextResponse.json({
            data: submissions,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Error fetching submissions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
