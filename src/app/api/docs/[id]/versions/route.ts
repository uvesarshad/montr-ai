import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import DocumentModel from '@/lib/db/models/document.model';
import DocVersionModel from '@/lib/db/models/doc-version.model';

// GET /api/docs/[id]/versions - Get version history
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const docId = params.id;

        // Verify doc ownership
        const doc = await DocumentModel.findById(docId);
        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }
        if (doc.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get all versions for this doc
        const versions = await DocVersionModel.find({ docId })
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
        console.error('Error fetching doc versions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch versions' },
            { status: 500 }
        );
    }
}

// POST /api/docs/[id]/versions - Create new version
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const docId = params.id;
        const body = await request.json();
        const { changeDescription, isAutoSave = false } = body;

        // Verify doc ownership
        const doc = await DocumentModel.findById(docId);
        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }
        if (doc.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Get the latest version number
        const latestVersion = await DocVersionModel.findOne({ docId })
            .sort({ version: -1 })
            .select('version')
            .lean();

        const newVersionNumber = (latestVersion?.version || 0) + 1;

        // Create new version snapshot
        const newVersion = await DocVersionModel.create({
            docId,
            version: newVersionNumber,
            content: doc.content,
            title: doc.title,
            createdBy: session.user.id,
            isAutoSave,
            changeDescription,
        });

        // Clean up old auto-save versions (keep last 10 auto-saves)
        if (isAutoSave) {
            const autoSaveVersions = await DocVersionModel.find({
                docId,
                isAutoSave: true,
            })
                .sort({ version: -1 })
                .skip(10) // Keep last 10
                .select('_id')
                .lean();

            if (autoSaveVersions.length > 0) {
                await DocVersionModel.deleteMany({
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
        console.error('Error creating doc version:', error);
        return NextResponse.json(
            { error: 'Failed to create version' },
            { status: 500 }
        );
    }
}
