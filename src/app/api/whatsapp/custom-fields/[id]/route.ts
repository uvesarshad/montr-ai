import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappCustomFieldRepository } from '@/lib/db/repository/whatsapp-custom-field.repository';

// GET - Get custom field by ID
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const field = await whatsappCustomFieldRepository.findById(params.id);

        if (!field) {
            return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
        }

        // Verify ownership
        return NextResponse.json({ field });
    } catch (error) {
        console.error('Error fetching custom field:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH - Update custom field
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const field = await whatsappCustomFieldRepository.findById(params.id);

        if (!field) {
            return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
        }

        // Verify ownership
        const body = await req.json();
        const { name, options, defaultValue, required, order } = body;

        const updated = await whatsappCustomFieldRepository.update(params.id, {
            name,
            options,
            defaultValue,
            required,
            order,
        });

        return NextResponse.json({
            success: true,
            field: updated,
        });
    } catch (error) {
        console.error('Error updating custom field:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// DELETE - Delete custom field
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const field = await whatsappCustomFieldRepository.findById(params.id);

        if (!field) {
            return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
        }

        // Verify ownership
        const { searchParams } = new URL(req.url);
        const hard = searchParams.get('hard') === 'true';

        if (hard) {
            await whatsappCustomFieldRepository.hardDelete(params.id);
        } else {
            await whatsappCustomFieldRepository.softDelete(params.id);
        }

        return NextResponse.json({
            success: true,
            message: 'Custom field deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting custom field:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
