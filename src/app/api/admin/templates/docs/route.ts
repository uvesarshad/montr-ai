import { NextRequest, NextResponse } from 'next/server';
import { connectMongoose } from '@/lib/mongodb';
import DocTemplate from '@/lib/db/models/doc-template.model';
import User from '@/lib/db/models/user.model';
import { getSession } from '@/lib/get-session';

// Helper to check for super admin
async function isSuperAdmin() {
    const session = await getSession();
    if (!session || !session.user || !session.user.email) return false;

    await connectMongoose();
    const user = await User.findOne({ email: session.user.email });
    return user && user.role === 'super_admin';
}

export async function GET(_req: NextRequest) {
    try {
        if (!await isSuperAdmin()) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await connectMongoose();
        const templates = await DocTemplate.find({})
            .sort({ sortOrder: 1, createdAt: -1 });

        return NextResponse.json({ templates });
    } catch (error) {
        console.error('Error fetching admin doc templates:', error);
        return NextResponse.json(
            { error: 'Failed to fetch templates' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!await isSuperAdmin()) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        await connectMongoose();

        // Get current user ID for createdBy field
        const session = await getSession();
        const user = await User.findOne({ email: session?.user?.email });
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const template = await DocTemplate.create({
            ...body,
            createdBy: user._id
        });

        return NextResponse.json({ template }, { status: 201 });
    } catch (error) {
        console.error('Error creating doc template:', error);
        return NextResponse.json(
            { error: 'Failed to create template' },
            { status: 500 }
        );
    }
}
