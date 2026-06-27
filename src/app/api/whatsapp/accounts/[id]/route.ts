import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';

// GET single account
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const account = await whatsappAccountRepository.findById(params.id);

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Verify ownership
        return NextResponse.json({ account });
    } catch (error) {
        console.error('Error fetching WhatsApp account:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// PATCH - Update account
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const account = await whatsappAccountRepository.findById(params.id);

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Verify ownership
        const body = await req.json();
        const updatedAccount = await whatsappAccountRepository.update(params.id, body);

        return NextResponse.json({ account: updatedAccount });
    } catch (error) {
        console.error('Error updating WhatsApp account:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// DELETE account
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const account = await whatsappAccountRepository.findById(params.id);

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Verify ownership
        await whatsappAccountRepository.delete(params.id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting WhatsApp account:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
