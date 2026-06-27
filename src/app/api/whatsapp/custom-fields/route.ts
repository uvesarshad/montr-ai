import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappCustomFieldRepository } from '@/lib/db/repository/whatsapp-custom-field.repository';

// GET - List all custom fields
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const accountId = searchParams.get('accountId');
        const includeDeleted = searchParams.get('includeDeleted') === 'true';

        let fields;
        if (accountId) {
            fields = await whatsappCustomFieldRepository.findByAccount(accountId, includeDeleted);
        } else {
            fields = await whatsappCustomFieldRepository.findByOrganization(
                includeDeleted
            );
        }

        return NextResponse.json({
            fields,
            total: fields.length,
        });
    } catch (error) {
        console.error('Error fetching custom fields:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create new custom field
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            whatsappAccountId,
            name,
            fieldKey,
            fieldType,
            options,
            defaultValue,
            required,
            order,
        } = body;

        if (!whatsappAccountId || !name || !fieldKey || !fieldType) {
            return NextResponse.json(
                { error: 'whatsappAccountId, name, fieldKey, and fieldType are required' },
                { status: 400 }
            );
        }

        // Validate field type
        const validTypes = ['text', 'number', 'date', 'dropdown', 'checkbox', 'url', 'email', 'phone'];
        if (!validTypes.includes(fieldType)) {
            return NextResponse.json(
                { error: `Invalid fieldType. Must be one of: ${validTypes.join(', ')}` },
                { status: 400 }
            );
        }

        // Check if field key already exists
        const existing = await whatsappCustomFieldRepository.findByKey(
            whatsappAccountId,
            fieldKey
        );
        if (existing) {
            return NextResponse.json(
                { error: 'Field key already exists for this account' },
                { status: 409 }
            );
        }

        const field = await whatsappCustomFieldRepository.create({
            whatsappAccountId,
            name,
            fieldKey: fieldKey.toLowerCase().trim(),
            fieldType,
            options,
            defaultValue,
            required: required || false,
            order: order || 0,
            createdById: session.user.id,
        });

        return NextResponse.json({
            success: true,
            field,
        });
    } catch (error) {
        console.error('Error creating custom field:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
