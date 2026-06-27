import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import DocumentModel from '@/lib/db/models/document.model';
import DocVersionModel from '@/lib/db/models/doc-version.model';

// GET /api/docs/[id]/versions/[versionId] - Get specific version content
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

        const docId = params.id;
        const versionId = params.versionId;

        // Verify doc ownership
        const doc = await DocumentModel.findById(docId);
        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }
        if (doc.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get specific version
        const version = await DocVersionModel.findOne({
            _id: versionId,
            docId,
        }).lean();

        if (!version) {
            return NextResponse.json({ error: 'Version not found' }, { status: 404 });
        }

        return NextResponse.json({ version });
    } catch (error) {
        console.error('Error fetching doc version:', error);
        return NextResponse.json(
            { error: 'Failed to fetch version' },
            { status: 500 }
        );
    }
}

// POST /api/docs/[id]/versions/[versionId]/restore - Restore doc to this version
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

        const docId = params.id;
        const versionId = params.versionId;

        // Verify doc ownership
        const doc = await DocumentModel.findById(docId);
        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }
        if (doc.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get version to restore
        const version = await DocVersionModel.findOne({
            _id: versionId,
            docId,
        }).lean();

        if (!version) {
            return NextResponse.json({ error: 'Version not found' }, { status: 404 });
        }

        // Create a backup of current state before restoring
        const latestVersion = await DocVersionModel.findOne({ docId })
            .sort({ version: -1 })
            .select('version')
            .lean();

        const backupVersionNumber = (latestVersion?.version || 0) + 1;

        await DocVersionModel.create({
            docId,
            version: backupVersionNumber,
            content: doc.content,
            title: doc.title,
            createdBy: session.user.id,
            isAutoSave: false,
            changeDescription: `Backup before restoring to version ${version.version}`,
        });

        // Restore doc to the selected version
        doc.content = version.content;
        doc.title = version.title;
        await doc.save();

        return NextResponse.json({
            message: 'Document restored successfully',
            doc: {
                _id: doc._id,
                title: doc.title,
                content: doc.content,
                updatedAt: doc.updatedAt,
            },
        });
    } catch (error) {
        console.error('Error restoring doc version:', error);
        return NextResponse.json(
            { error: 'Failed to restore version' },
            { status: 500 }
        );
    }
}
