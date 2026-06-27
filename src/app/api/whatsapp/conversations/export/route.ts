import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { conversationExportService } from '@/lib/services/conversation-export.service';

/**
 * GET /api/whatsapp/conversations/export
 * Export conversation history
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const contactId = searchParams.get('contactId') || undefined;
        const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
        const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
        const format = (searchParams.get('format') || 'csv') as 'csv' | 'json';

        const exportData = await conversationExportService.exportConversations(
            {
                contactId,
                startDate,
                endDate,
                format,
            }
        );

        const filename = `whatsapp-conversations-${new Date().toISOString().split('T')[0]}.${format}`;
        const contentType = format === 'json' ? 'application/json' : 'text/csv';

        return new NextResponse(exportData, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error('Error exporting conversations:', error);
        return NextResponse.json(
            { error: 'Failed to export conversations' },
            { status: 500 }
        );
    }
}
