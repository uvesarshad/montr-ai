import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappContactGroupRepository } from '@/lib/db/repository/whatsapp-contact-group.repository';

// GET - Get contacts in group
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const group = await whatsappContactGroupRepository.findById(params.id);

        if (!group) {
            return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        }

        // Verify ownership
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '100');
        const skip = parseInt(searchParams.get('skip') || '0');

        const contactIds = await whatsappContactGroupRepository.getGroupContacts(
            params.id,
            limit,
            skip
        );

        return NextResponse.json({
            contactIds,
            total: group.contactCount,
            limit,
            skip,
        });
    } catch (error) {
        console.error('Error fetching group contacts:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Add contacts to group
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const group = await whatsappContactGroupRepository.findById(params.id);

        if (!group) {
            return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        }

        // Verify ownership
        const body = await req.json();
        const { contactIds } = body;

        if (!Array.isArray(contactIds) || contactIds.length === 0) {
            return NextResponse.json(
                { error: 'contactIds array is required' },
                { status: 400 }
            );
        }

        const addedCount = await whatsappContactGroupRepository.addContacts(
            params.id,
            contactIds,
            session.user.id
        );

        return NextResponse.json({
            success: true,
            addedCount,
            message: `${addedCount} contact(s) added to group`,
        });
    } catch (error) {
        console.error('Error adding contacts to group:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Remove contacts from group
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const group = await whatsappContactGroupRepository.findById(params.id);

        if (!group) {
            return NextResponse.json({ error: 'Group not found' }, { status: 404 });
        }

        // Verify ownership
        const body = await req.json();
        const { contactIds } = body;

        if (!Array.isArray(contactIds) || contactIds.length === 0) {
            return NextResponse.json(
                { error: 'contactIds array is required' },
                { status: 400 }
            );
        }

        const removedCount = await whatsappContactGroupRepository.removeContacts(
            params.id,
            contactIds
        );

        return NextResponse.json({
            success: true,
            removedCount,
            message: `${removedCount} contact(s) removed from group`,
        });
    } catch (error) {
        console.error('Error removing contacts from group:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
