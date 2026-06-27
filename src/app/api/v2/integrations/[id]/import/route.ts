import { NextRequest, NextResponse } from 'next/server';
import { resolveIntegrationContext } from '@/lib/integrations/server/route-helpers';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';
import { integrationImportRecordRepository } from '@/lib/db/repository/integration-import-record.repository';
import { runImport } from '@/lib/integrations/import/import-service';

/**
 * POST /api/v2/integrations/[id]/import — pull audience/contact data from a
 * connected Mailchimp or HubSpot account into the import staging store. Runs
 * inline (per-run caps keep it bounded). Imported data does NOT enter the CRM.
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
        const connection = await integrationConnectionRepository.findById(
            id
        );
        if (!connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        if (connection.provider !== 'mailchimp' && connection.provider !== 'hubspot') {
            return NextResponse.json(
                { error: `Provider "${connection.provider}" does not support import.` },
                { status: 400 }
            );
        }

        const result = await runImport({
            connectionId: id
        });

        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Import failed';
        console.error('Error importing integration data:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * GET /api/v2/integrations/[id]/import — count of staged records imported via
 * this connection (for UI display).
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await resolveIntegrationContext();
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { id } = await params;
        const connection = await integrationConnectionRepository.findById(
            id
        );
        if (!connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        const count = await integrationImportRecordRepository.countByConnection(
            id
        );

        return NextResponse.json({ count });
    } catch (error) {
        console.error('Error counting imported records:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
