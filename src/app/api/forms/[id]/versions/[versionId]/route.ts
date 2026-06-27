import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import FormVersionModel from '@/lib/db/models/form-version.model';

// GET /api/forms/[id]/versions/[versionId] - Get specific version content
export async function GET(
    _request: NextRequest,
    props: { params: Promise<{ id: string; versionId: string }> }
) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const formId = params.id;
        const versionId = params.versionId;

        // Verify form ownership
        const form = await FormModel.findById(formId);
        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }
        if (form.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get specific version
        const version = await FormVersionModel.findOne({
            _id: versionId,
            formId,
        }).lean();

        if (!version) {
            return NextResponse.json({ error: 'Version not found' }, { status: 404 });
        }

        return NextResponse.json({ version });
    } catch (error) {
        console.error('Error fetching form version:', error);
        return NextResponse.json(
            { error: 'Failed to fetch version' },
            { status: 500 }
        );
    }
}

// POST /api/forms/[id]/versions/[versionId]/restore - Restore form to this version
export async function POST(
    _request: NextRequest,
    props: { params: Promise<{ id: string; versionId: string }> }
) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const formId = params.id;
        const versionId = params.versionId;

        // Verify form ownership
        const form = await FormModel.findById(formId);
        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }
        if (form.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get version to restore
        const version = await FormVersionModel.findOne({
            _id: versionId,
            formId,
        }).lean();

        if (!version) {
            return NextResponse.json({ error: 'Version not found' }, { status: 404 });
        }

        // Create a backup of current state before restoring
        const latestVersion = await FormVersionModel.findOne({ formId })
            .sort({ version: -1 })
            .select('version')
            .lean();

        const backupVersionNumber = (latestVersion?.version || 0) + 1;

        await FormVersionModel.create({
            formId,
            version: backupVersionNumber,
            content: form.content,
            title: form.title,
            createdBy: session.user.id,
            isAutoSave: false,
            changeDescription: `Backup before restoring to version ${version.version}`,
        });

        // Restore form to the selected version
        form.content = version.content;
        form.title = version.title;
        await form.save();

        return NextResponse.json({
            message: 'Form restored successfully',
            form: {
                _id: form._id,
                title: form.title,
                content: form.content,
                updatedAt: form.updatedAt,
            },
        });
    } catch (error) {
        console.error('Error restoring form version:', error);
        return NextResponse.json(
            { error: 'Failed to restore version' },
            { status: 500 }
        );
    }
}
