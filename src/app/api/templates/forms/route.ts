import { NextRequest, NextResponse } from 'next/server';
import { connectMongoose } from '@/lib/mongodb';
import FormTemplate from '@/lib/db/models/form-template.model';

export async function GET(_req: NextRequest) {
    try {
        await connectMongoose();

        const templates = await FormTemplate.find({ isActive: true })
            .sort({ sortOrder: 1, createdAt: 1 })
            .select('-__v');

        return NextResponse.json({ templates });
    } catch (error) {
        console.error('Error fetching form templates:', error);
        return NextResponse.json(
            { error: 'Failed to fetch form templates' },
            { status: 500 }
        );
    }
}
