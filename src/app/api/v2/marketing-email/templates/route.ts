
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import MarketingTemplate from '@/lib/db/models/marketing-email/template.model';
import { createMarketingTemplateSchema } from '@/validations/marketing-email/template.schema';

export async function GET(_req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();

        const templates = await MarketingTemplate.find({
}).sort({ createdAt: -1 });

        return NextResponse.json({ data: templates });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const validated = createMarketingTemplateSchema.safeParse(body);

        if (!validated.success) {
            return NextResponse.json({ error: validated.error.flatten() }, { status: 400 });
        }

        await connectDB();

        const template = await MarketingTemplate.create({
            ...validated.data,
            createdById: session.user.id,
        });

        return NextResponse.json(template, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
