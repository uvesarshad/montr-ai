import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import bcrypt from 'bcryptjs';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        await dbConnect();

        const form = await FormModel.findOne({ _id: id, userId: session.user.id });
        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }

        return NextResponse.json(form);
    } catch (error) {
        console.error('Error fetching form:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const updates = await req.json();

        await dbConnect();

        // Prevent updating sensitive fields or userId
        delete updates.userId;
        delete updates._id;
        delete updates.views;
        delete updates.submissionsCount;

        // Handle password hashing
        if (updates.password !== undefined) {
            if (updates.password && updates.password.trim() !== '') {
                const salt = await bcrypt.genSalt(10);
                updates.password = await bcrypt.hash(updates.password, salt);
                updates.isPasswordProtected = true;
            } else {
                updates.password = null;
                updates.isPasswordProtected = false;
            }
        }

        const form = await FormModel.findOneAndUpdate(
            { _id: id, userId: session.user.id },
            { $set: updates },
            { new: true }
        );

        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }

        return NextResponse.json(form);
    } catch (error) {
        console.error('Error updating form:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        await dbConnect();

        const form = await FormModel.findOneAndDelete({ _id: id, userId: session.user.id });

        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Form deleted successfully' });
    } catch (error) {
        console.error('Error deleting form:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
