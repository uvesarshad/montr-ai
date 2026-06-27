import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { aiResponseService } from '@/lib/services/ai-response.service';
import CrmContact from '@/lib/db/models/crm/contact.model';

/**
 * POST /api/whatsapp/ai/suggest
 * Generate AI-powered response suggestions
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { contactId, message, count = 1 } = body;

        if (!contactId || !message) {
            return NextResponse.json(
                { error: 'contactId and message are required' },
                { status: 400 }
            );
        }

        // Fetch contact info
        const contact = await CrmContact.findById(contactId);

        if (!contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        // Verify ownership
        // Generate suggestions
        const contactInfo = {
            firstName: contact.firstName,
            lastName: contact.lastName as string | undefined,
            tags: contact.tags as unknown as string[] | undefined,
        };
        const suggestions = count > 1
            ? await aiResponseService.generateMultipleSuggestions({
                contactId,
                currentMessage: message,
                contactInfo,
            }, count)
            : [await aiResponseService.generateResponse({
                contactId,
                currentMessage: message,
                contactInfo,
            })];

        return NextResponse.json({ suggestions });
    } catch (error) {
        console.error('Error generating AI suggestions:', error);
        return NextResponse.json(
            { error: 'Failed to generate suggestions', details: (error instanceof Error ? error.message : String(error)) },
            { status: 500 }
        );
    }
}
