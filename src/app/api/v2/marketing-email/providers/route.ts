
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import MarketingProvider from '@/lib/db/models/marketing-email/provider.model';
import { createMarketingProviderSchema } from '@/validations/marketing-email/provider.schema';

export async function GET(_req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();

        const providers = await MarketingProvider.find({
}).sort({ createdAt: -1 });

        return NextResponse.json({ data: providers });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const validated = createMarketingProviderSchema.safeParse(body);

        if (!validated.success) {
            return NextResponse.json({ error: validated.error.flatten() }, { status: 400 });
        }

        await connectDB();

        // If setting as default, unset others
        if (validated.data.isDefault) {
            await MarketingProvider.updateMany(
                { },
                { isDefault: false }
            );
        }

        const provider = await MarketingProvider.create({
            ...validated.data,
            createdById: session.user.id,
        });

        return NextResponse.json(provider, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
