import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import { listScheduledTasks } from '@/lib/agent/scheduled-task-runner';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get('missionId') || undefined;
    const brandId = searchParams.get('brandId') || undefined;
    const status = searchParams.get('status') || undefined;
    const tasks = await listScheduledTasks({ missionId, brandId, status });
    return NextResponse.json({ scheduledTasks: tasks });
  } catch (error) {
    console.error('Error fetching agent scheduled tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch agent scheduled tasks' }, { status: 500 });
  }
}
