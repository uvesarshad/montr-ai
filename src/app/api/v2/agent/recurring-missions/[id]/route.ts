import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import RecurringMissionConfig from '@/lib/db/models/recurring-mission-config.model';
import { connectMongoose } from '@/lib/mongodb';

function getOrgId(session: { user?: { id?: string; } } | null) {
  return session?.user?.id || session?.user?.id || '';
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  budgetCap: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const patch = patchSchema.parse(await request.json());
    await connectMongoose();
    const doc = await RecurringMissionConfig.findOneAndUpdate(
      { _id: id },
      { $set: patch },
      { new: true },
    );
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(doc);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    await connectMongoose();
    const doc = await RecurringMissionConfig.findOneAndDelete({ _id: id });
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
