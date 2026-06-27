import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { customFieldRepository } from '@/lib/db/repository/crm/custom-field.repository';
import { createCustomFieldSchema } from '@/validations/crm/custom-field.schema';
import { ZodError } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') as 'contact' | 'company' | 'deal' | null;
    const isActive = searchParams.get('isActive');

    let fields;
    if (entityType) {
      fields = await customFieldRepository.findByEntityType(
        entityType,
        isActive !== 'false'
      );
    } else {
      fields = await customFieldRepository.findAll(isActive !== 'false');
    }

    return NextResponse.json({ data: fields });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching custom fields:', error);
    return NextResponse.json({ error: 'Failed to fetch custom fields' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);
    const body = await request.json();
    const validated = createCustomFieldSchema.parse(body);

    // Check for duplicate key in same entity type
    const existing = await customFieldRepository.findByKey(
      validated.fieldKey,
      validated.entityType
    );
    if (existing) {
      return NextResponse.json(
        { error: 'A field with this key already exists for this entity type' },
        { status: 400 }
      );
    }

    const field = await customFieldRepository.create({
      ...validated,
      createdById: userId,
    });

    return NextResponse.json({ data: field }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating custom field:', error);
    return NextResponse.json({ error: 'Failed to create custom field' }, { status: 500 });
  }
}
