import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappContactGroupRepository } from '@/lib/db/repository/whatsapp-contact-group.repository';

// GET - Get group by ID
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
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
        return NextResponse.json({ group });
    } catch (error) {
        console.error('Error fetching group:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update group
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
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
        const { name, description } = body;

        const updated = await whatsappContactGroupRepository.update(params.id, {
            name,
            description,
        });

        return NextResponse.json({
            success: true,
            group: updated,
        });
    } catch (error) {
        console.error('Error updating group:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete group
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
        const { searchParams } = new URL(req.url);
        const hard = searchParams.get('hard') === 'true';

        if (hard) {
            await whatsappContactGroupRepository.hardDelete(params.id);
        } else {
            await whatsappContactGroupRepository.softDelete(params.id);
        }

        return NextResponse.json({
            success: true,
            message: 'Group deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting group:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
