
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import MarketingTemplate from '@/lib/db/models/marketing-email/template.model';
import { updateMarketingTemplateSchema } from '@/validations/marketing-email/template.schema';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();
        const template = await MarketingTemplate.findOne({
            _id: params.id
        });

        if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

        return NextResponse.json(template);
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const validated = updateMarketingTemplateSchema.safeParse(body);

        if (!validated.success) {
            return NextResponse.json({ error: validated.error.flatten() }, { status: 400 });
        }

        await connectDB();
        const template = await MarketingTemplate.findOneAndUpdate(
            { _id: params.id },
            { ...validated.data },
            { new: true }
        );

        if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

        return NextResponse.json(template);
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();
        const template = await MarketingTemplate.findOneAndDelete({
            _id: params.id
        });

        if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
