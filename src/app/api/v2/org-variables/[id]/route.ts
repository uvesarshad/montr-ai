import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { z } from 'zod';
import { userRepository } from '@/lib/db/repository/user.repository';
import { orgVariableRepository } from '@/lib/db/repository/org-variable.repository';
import { updateOrgVariableSchema } from '@/validations/org-variable';

async function getOrgId(userId: string): Promise<string | null> {
  const user = await userRepository.findById(userId);
  return user?.id ? user.id!.toString() : null;
}

// PATCH /api/v2/org-variables/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const validated = updateOrgVariableSchema.parse(body);

    const updated = await orgVariableRepository.update(id, {
      key: validated.key,
      value: validated.value,
      brandId: validated.brandId,
      description: validated.description,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Variable not found' }, { status: 404 });
    }

    return NextResponse.json({ variable: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.flatten() },
        { status: 400 }
      );
    }
    if ((error as { code?: number })?.code === 11000) {
      return NextResponse.json(
        { error: 'A variable with this key already exists in this scope' },
        { status: 409 }
      );
    }
    console.error('Error updating org variable:', error);
    return NextResponse.json({ error: 'Failed to update variable' }, { status: 500 });
  }
}

// DELETE /api/v2/org-variables/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const ok = await orgVariableRepository.delete(id);
    if (!ok) {
      return NextResponse.json({ error: 'Variable not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting org variable:', error);
    return NextResponse.json({ error: 'Failed to delete variable' }, { status: 500 });
  }
}
