import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';

// GET all accounts for the organization
export async function GET(_req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accounts = await whatsappAccountRepository.findByOrganizationId(
);

        return NextResponse.json({ accounts });
    } catch (error) {
        console.error('Error fetching WhatsApp accounts:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// POST - Create a new WhatsApp account connection
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            name,
            facebookAppId,
            wabaId,
            phoneNumberId,
            accessToken,
            webhookVerifyToken,
            phoneNumber,
            displayPhoneNumber,
        } = body;

        // Validate required fields
        if (!name || !facebookAppId || !wabaId || !phoneNumberId || !accessToken || !phoneNumber) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Create the account
        const account = await whatsappAccountRepository.create({
            name,
            // @ts-expect-error
            facebookAppId,
            wabaId,
            phoneNumberId,
            accessToken,
            webhookVerifyToken: webhookVerifyToken || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
            phoneNumber,
            displayPhoneNumber: displayPhoneNumber || phoneNumber,
            createdById: session.user.id,
        });

        return NextResponse.json({ account }, { status: 201 });
    } catch (error) {
        console.error('Error creating WhatsApp account:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
