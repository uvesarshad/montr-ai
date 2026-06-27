import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { analyticsSourceRepository } from '@/lib/db/repository/analytics-source.repository';

/**
 * Disconnects (deletes) an analytics source connection.
 * DELETE /api/v2/analytics/sources/[id]
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
        const source = await analyticsSourceRepository.findById(id);
        if (!source) {
            return NextResponse.json({ error: 'Analytics source not found' }, { status: 404 });
        }

        await analyticsSourceRepository.delete(id);

        return NextResponse.json({ deleted: true });
    } catch (error) {
        console.error('Error disconnecting analytics source:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
