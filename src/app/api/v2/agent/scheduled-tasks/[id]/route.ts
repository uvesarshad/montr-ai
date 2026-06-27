import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/get-session';
import { toggleScheduledTask, deleteScheduledTask, retryScheduledTask } from '@/lib/agent/scheduled-task-runner';

const patchSchema = z.object({
  status: z.enum(['active', 'paused']),
});

const retrySchema = z.object({
  action: z.literal('retry'),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const rawBody = await request.json();

    // Handle retry action
    const retryResult = retrySchema.safeParse(rawBody);
    if (retryResult.success) {
      const task = await retryScheduledTask(id);
      if (!task) {
        return NextResponse.json({ error: 'Scheduled task not found' }, { status: 404 });
      }
      return NextResponse.json({ scheduledTask: task });
    }

    // Handle pause/resume
    const body = patchSchema.parse(rawBody);
    const task = await toggleScheduledTask(id, body.status);

    if (!task) {
      return NextResponse.json({ error: 'Scheduled task not found' }, { status: 404 });
    }

    return NextResponse.json({ scheduledTask: task });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    console.error('Error updating scheduled task:', error);
    return NextResponse.json({ error: 'Failed to update scheduled task' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const task = await deleteScheduledTask(id);

    if (!task) {
      return NextResponse.json({ error: 'Scheduled task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting scheduled task:', error);
    return NextResponse.json({ error: 'Failed to delete scheduled task' }, { status: 500 });
  }
}
