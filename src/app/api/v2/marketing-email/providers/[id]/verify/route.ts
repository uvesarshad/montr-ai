
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import MarketingProvider from '@/lib/db/models/marketing-email/provider.model';
import { ProviderFactory } from '@/lib/marketing-email/providers/provider-factory';

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await connectDB();

        const provider = await MarketingProvider.findOne({
            _id: params.id
        });

        if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });

        try {
            const providerService = ProviderFactory.create(provider);
            const verification = await providerService.verify();

            provider.isVerified = verification.success;
            provider.verifiedAt = verification.success ? new Date() : undefined;
            provider.lastTestedAt = new Date();
            provider.lastError = verification.success ? undefined : verification.message;

            await provider.save();

            return NextResponse.json(verification);
        } catch (error) {
            provider.isVerified = false;
            provider.lastTestedAt = new Date();
            provider.lastError = (error instanceof Error ? error.message : String(error));
            await provider.save();

            return NextResponse.json({ success: false, message: (error instanceof Error ? error.message : String(error)) }, { status: 400 });
        }

    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
