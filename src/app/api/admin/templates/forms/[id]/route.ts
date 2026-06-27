import { NextRequest, NextResponse } from 'next/server';
import { connectMongoose } from '@/lib/mongodb';
import FormTemplate from '@/lib/db/models/form-template.model';
import User from '@/lib/db/models/user.model';
import { getSession } from '@/lib/get-session';

async function isSuperAdmin() {
    const session = await getSession();
    if (!session || !session.user || !session.user.email) return false;

    await connectMongoose();
    const user = await User.findOne({ email: session.user.email });
    return user && user.role === 'super_admin';
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        if (!(await isSuperAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await connectMongoose();
        const template = await FormTemplate.findById(params.id);

        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json({ template });
    } catch (error) {
        console.error('Error fetching template:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        if (!(await isSuperAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        await connectMongoose();

        const template = await FormTemplate.findByIdAndUpdate(
            params.id,
            { ...body },
            { new: true, runValidators: true }
        );

        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json({ template });
    } catch (error) {
        console.error('Error updating template:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        if (!(await isSuperAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await connectMongoose();
        const template = await FormTemplate.findByIdAndDelete(params.id);

        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Template deleted successfully' });
    } catch (error) {
        console.error('Error deleting template:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
