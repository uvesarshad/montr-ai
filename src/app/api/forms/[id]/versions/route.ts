import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import FormVersionModel from '@/lib/db/models/form-version.model';

// GET /api/forms/[id]/versions - Get version history
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const formId = params.id;

        // Verify form ownership
        const form = await FormModel.findById(formId);
        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }
        if (form.userId.toString() !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get all versions for this form
        const versions = await FormVersionModel.find({ formId })
            .sort({ version: -1 }) // Newest first
            .select('-content') // Exclude content for list view (performance)
            .limit(50) // Limit to last 50 versions
            .lean();

        return NextResponse.json({
            versions: versions.map(v => ({
                _id: v._id,
                version: v.version,
                title: v.title,
                createdBy: v.createdBy,
                createdAt: v.createdAt,
                isAutoSave: v.isAutoSave,
                changeDescription: v.changeDescription,
            })),
        });
    } catch (error) {
        console.error('Error fetching form versions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch versions' },
            { status: 500 }
        );
    }
}

// POST /api/forms/[id]/versions - Create new version
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const formId = params.id;
        const body = await request.json();
        const { changeDescription, isAutoSave = false } = body;

        // Verify form ownership
        const form = await FormModel.findById(formId);
        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }
        if (form.userId.toString() !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get the latest version number
        const latestVersion = await FormVersionModel.findOne({ formId })
            .sort({ version: -1 })
            .select('version')
            .lean();

        const newVersionNumber = (latestVersion?.version || 0) + 1;

        // Create new version snapshot
        const newVersion = await FormVersionModel.create({
            formId,
            version: newVersionNumber,
            content: form.content,
            title: form.title,
            createdBy: session.user.id,
            isAutoSave,
            changeDescription,
        });

        // Clean up old auto-save versions (keep last 10 auto-saves)
        if (isAutoSave) {
            const autoSaveVersions = await FormVersionModel.find({
                formId,
                isAutoSave: true,
            })
                .sort({ version: -1 })
                .skip(10) // Keep last 10
                .select('_id')
                .lean();

            if (autoSaveVersions.length > 0) {
                await FormVersionModel.deleteMany({
                    _id: { $in: autoSaveVersions.map(v => v._id) },
                });
            }
        }

        return NextResponse.json({
            version: {
                _id: newVersion._id,
                version: newVersion.version,
                title: newVersion.title,
                createdBy: newVersion.createdBy,
                createdAt: newVersion.createdAt,
                isAutoSave: newVersion.isAutoSave,
                changeDescription: newVersion.changeDescription,
            },
        });
    } catch (error) {
        console.error('Error creating form version:', error);
        return NextResponse.json(
            { error: 'Failed to create version' },
            { status: 500 }
        );
    }
}
