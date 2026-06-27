import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';

/**
 * Disconnects (deletes) an ad account connection.
 * DELETE /api/v2/ads/accounts/[id]
 */
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { id } = await params;
        const account = await adAccountRepository.findById(id);
        if (!account) {
            return NextResponse.json({ error: 'Ad account not found' }, { status: 404 });
        }

        await adAccountRepository.delete(id);

        return NextResponse.json({ deleted: true });
    } catch (error) {
        console.error('Error disconnecting ad account:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
