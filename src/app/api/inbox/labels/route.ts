import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import InboxLabel from '@/lib/db/models/inbox-label.model';
import { Types } from 'mongoose';

/**
 * GET /api/inbox/labels
 * List all labels for organization
 */
export async function GET(_req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const labels = await InboxLabel.find({
}).sort({ name: 1 });

        return NextResponse.json({ labels });
    } catch (error) {
        console.error('Error fetching labels:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

/**
 * POST /api/inbox/labels
 * Create a new label
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, color, description } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const label = await InboxLabel.create({
            name,
            color: color || '#3B82F6',
            description,
            createdById: new Types.ObjectId(session.user.id!),
        });

        return NextResponse.json({ label });
    } catch (error) {
        console.error('Error creating label:', error);

        // Handle duplicate label name
        if ((error as { code?: number })?.code === 11000) {
            return NextResponse.json({ error: 'Label name already exists' }, { status: 400 });
        }

        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
