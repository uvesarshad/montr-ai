import { NextRequest, NextResponse } from 'next/server';
import { getProviderServerConfig } from '@/lib/integrations/server/provider-config';
import { resolveIntegrationContext } from '@/lib/integrations/server/route-helpers';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';

/**
 * POST /api/v2/integrations/[id]/test — live health check for a connection.
 * Updates status/lastError/lastTestedAt on the record.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await resolveIntegrationContext();
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { id } = await params;
        const decrypted = await integrationConnectionRepository.findByIdWithCredentials(
            id
        );
        if (!decrypted) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        const serverConfig = getProviderServerConfig(decrypted.connection.provider);
        const result = await serverConfig.test(
            decrypted.credentials,
            decrypted.connection.metadata || {}
        );

        await integrationConnectionRepository.markTested(id, result.ok, result.error);

        return NextResponse.json({
            ok: result.ok,
            error: result.ok ? null : result.error,
        });
    } catch (error) {
        console.error('Error testing integration:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
