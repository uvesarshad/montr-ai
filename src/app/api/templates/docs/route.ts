import { NextRequest, NextResponse } from 'next/server';
import { connectMongoose } from '@/lib/mongodb';
import DocTemplate from '@/lib/db/models/doc-template.model';

export async function GET(_req: NextRequest) {
    try {
        await connectMongoose();

        const templates = await DocTemplate.find({ isActive: true })
            .sort({ sortOrder: 1, createdAt: 1 })
            .select('-__v');

        return NextResponse.json({ templates });
    } catch (error) {
        console.error('Error fetching doc templates:', error);
        return NextResponse.json(
            { error: 'Failed to fetch doc templates' },
            { status: 500 }
        );
    }
}
