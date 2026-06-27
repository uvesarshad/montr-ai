import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { z } from 'zod';
import { orgVariableRepository } from '@/lib/db/repository/org-variable.repository';
import { createOrgVariableSchema } from '@/validations/org-variable';
// GET /api/v2/org-variables — list org + brand variables for the org
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const variables = await orgVariableRepository.listByOrg();
    return NextResponse.json({ variables });
  } catch (error) {
    console.error('Error listing org variables:', error);
    return NextResponse.json({ error: 'Failed to list variables' }, { status: 500 });
  }
}

// POST /api/v2/org-variables — create a variable
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const validated = createOrgVariableSchema.parse(body);

    const created = await orgVariableRepository.create({
      brandId: validated.brandId ?? null,
      key: validated.key,
      value: validated.value,
      description: validated.description ?? undefined,
    });

    return NextResponse.json({ variable: created }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.flatten() },
        { status: 400 }
      );
    }
    // Duplicate {organizationId, brandId, key}
    if ((error as { code?: number })?.code === 11000) {
      return NextResponse.json(
        { error: 'A variable with this key already exists in this scope' },
        { status: 409 }
      );
    }
    console.error('Error creating org variable:', error);
    return NextResponse.json({ error: 'Failed to create variable' }, { status: 500 });
  }
}
