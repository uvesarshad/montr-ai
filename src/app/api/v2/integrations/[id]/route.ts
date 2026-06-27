import { NextRequest, NextResponse } from 'next/server';
import { resolveIntegrationContext } from '@/lib/integrations/server/route-helpers';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';

/**
 * DELETE /api/v2/integrations/[id] — disconnect an integration.
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await resolveIntegrationContext();
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { id } = await params;
        const deleted = await integrationConnectionRepository.delete(
            id
        );
        if (!deleted) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error disconnecting integration:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
