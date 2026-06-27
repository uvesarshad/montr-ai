import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await dbConnect();

        // Find by ID or Slug
        const query = mongoose.isValidObjectId(id) ? { _id: id } : { slug: id };

        const form = await FormModel.findOne({ ...query, isPublished: true })
            .select('title content settings slug userId createdAt isPasswordProtected organizationId +password');

        if (!form) {
            return NextResponse.json({ error: 'Form not found' }, { status: 404 });
        }

        // Password gate — same pattern as public documents
        if (form.isPasswordProtected) {
            const providedPassword = req.headers.get('x-form-password');
            let authorized = false;

            if (providedPassword && form.password) {
                authorized = await bcrypt.compare(providedPassword, form.password);
            }

            if (!authorized) {
                return NextResponse.json({
                    isPasswordProtected: true,
                    _id: form._id,
                    title: form.title,
                    slug: form.slug,
                }, { status: 401 });
            }
        }

        // Increment view count (fire and forget)
        FormModel.updateOne({ _id: form._id }, { $inc: { views: 1 } }).exec();

        // Strip the hashed password from the response
        const formObj = form.toObject();
        delete (formObj as unknown as Record<string, unknown>).password;

        return NextResponse.json(formObj);
    } catch (error) {
        console.error('Error fetching public form:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


