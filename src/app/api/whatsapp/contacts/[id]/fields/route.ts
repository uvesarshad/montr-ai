import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappCustomFieldRepository } from '@/lib/db/repository/whatsapp-custom-field.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';

// GET - Get all field values for a contact
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const contactId = params.id;

        // Verify contact exists and belongs to organization
        const contact = await contactRepository.findById(contactId);
        if (!contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        const fieldsWithValues = await whatsappCustomFieldRepository.getContactFieldValuesWithDetails(
            contactId
        );

        return NextResponse.json({
            contactId,
            fields: fieldsWithValues,
        });
    } catch (error) {
        console.error('Error fetching contact field values:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Set field values for a contact (bulk)
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const contactId = params.id;

        // Verify contact exists and belongs to organization
        const contact = await contactRepository.findById(contactId);
        if (!contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        const body = await req.json();
        const { fields } = body; // { fieldKey: value, fieldKey2: value2, ... }

        if (!fields || typeof fields !== 'object') {
            return NextResponse.json(
                { error: 'fields object is required' },
                { status: 400 }
            );
        }

        await whatsappCustomFieldRepository.bulkSetFieldValues(
            contactId,
            fields
        );

        return NextResponse.json({
            success: true,
            message: 'Field values updated successfully',
        });
    } catch (error) {
        console.error('Error setting contact field values:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PUT - Set a single field value
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const contactId = params.id;

        // Verify contact exists and belongs to organization
        const contact = await contactRepository.findById(contactId);
        if (!contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        }

        const body = await req.json();
        const { fieldId, value } = body;

        if (!fieldId || value === undefined) {
            return NextResponse.json(
                { error: 'fieldId and value are required' },
                { status: 400 }
            );
        }

        // Verify field exists and belongs to organization
        const field = await whatsappCustomFieldRepository.findById(fieldId);
        if (!field) {
            return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
        }
        await whatsappCustomFieldRepository.setFieldValue({
            fieldId,
            contactId,
            value: String(value),
        });

        return NextResponse.json({
            success: true,
            message: 'Field value set successfully',
        });
    } catch (error) {
        console.error('Error setting field value:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
