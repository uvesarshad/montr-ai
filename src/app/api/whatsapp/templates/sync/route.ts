import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { whatsappTemplateRepository } from '@/lib/db/repository/whatsapp-template.repository';

// POST - Sync templates from Meta
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { accountId } = await req.json();

        if (!accountId) {
            return NextResponse.json(
                { error: 'Account ID is required' },
                { status: 400 }
            );
        }

        // Get the account
        const account = await whatsappAccountRepository.findById(accountId);

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Verify ownership
        // Fetch templates from Meta Graph API
        const url = `https://graph.facebook.com/v19.0/${account.wabaId}/message_templates`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${account.accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Meta API Error:', error);
            return NextResponse.json(
                { error: 'Failed to fetch templates from Meta' },
                { status: response.status }
            );
        }

        const data = await response.json();
        const templates = data.data || [];

        // Sync templates to database
        const syncedTemplates = [];
        for (const template of templates) {
            const synced = await whatsappTemplateRepository.upsert({
                whatsappAccountId: account._id.toString(),
                metaId: template.id,
                name: template.name,
                language: template.language,
                status: template.status,
                category: template.category,
                components: template.components || [],
            });
            syncedTemplates.push(synced);
        }

        return NextResponse.json({
            success: true,
            count: syncedTemplates.length,
            templates: syncedTemplates,
        });
    } catch (error) {
        console.error('Error syncing templates:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
