import { NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import {
    createScheduledTask,
    listScheduledTasks,
    toggleScheduledTask,
    deleteScheduledTask,
    processScheduledTasks,
} from '@/lib/agent/scheduled-task-runner';

/**
 * GET /api/v2/scheduled-tasks
 * List scheduled tasks for the user's organization.
 */
export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const brandId = searchParams.get('brandId') || undefined;
        const missionId = searchParams.get('missionId') || undefined;
        const status = searchParams.get('status') || undefined;
        const tasks = await listScheduledTasks({ brandId, missionId, status });
        return NextResponse.json(tasks);
    } catch (error) {
        console.error('Error listing scheduled tasks:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

/**
 * POST /api/v2/scheduled-tasks
 * Create a new scheduled task OR trigger processing of due tasks.
 * 
 * Body: { action: 'create', ...taskData } or { action: 'process' }
 */
export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await req.json();
        if (body.action === 'process') {
            // GLOBAL, cross-tenant operation: processScheduledTasks() processes
            // due tasks for EVERY org, so it must not be triggerable by an
            // ordinary authenticated user. Allow only the cron caller (Bearer
            // CRON_SECRET, fail-closed if unset) or a super_admin.
            const cronSecret = process.env.CRON_SECRET;
            const authHeader = req.headers.get('authorization');
            const cronAuthorized = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
            const isSuperAdmin = session.user.role === 'super_admin';
            if (!cronAuthorized && !isSuperAdmin) {
                return new NextResponse('Forbidden', { status: 403 });
            }
            const processed = await processScheduledTasks();
            return NextResponse.json({ processed });
        }

        // Create a new scheduled task
        const { name, description, toolName, toolArgs, cronExpression, timezone, maxRuns, brandId, missionId } = body;

        if (!name || !toolName || !cronExpression) {
            return new NextResponse('name, toolName, and cronExpression are required', { status: 400 });
        }

        const task = await createScheduledTask({
            brandId: brandId || '',
            userId: session.user.id,
            missionId: missionId || undefined,
            name,
            description: description || '',
            toolName,
            toolArgs: toolArgs || {},
            cronExpression,
            timezone,
            maxRuns,
        });

        return NextResponse.json(task, { status: 201 });
    } catch (error) {
        console.error('Error creating scheduled task:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

/**
 * PATCH /api/v2/scheduled-tasks
 * Toggle a task's status (active/paused) or delete it.
 * Body: { taskId: string, action: 'toggle' | 'delete', status?: 'active' | 'paused' }
 */
export async function PATCH(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { taskId, action, status } = await req.json();
        if (!taskId || !action) {
            return new NextResponse('taskId and action are required', { status: 400 });
        }

        if (action === 'delete') {
            await deleteScheduledTask(taskId);
            return NextResponse.json({ deleted: true });
        }

        if (action === 'toggle') {
            const task = await toggleScheduledTask(taskId, status || 'paused');
            return NextResponse.json(task);
        }

        return new NextResponse('Invalid action', { status: 400 });
    } catch (error) {
        console.error('Error updating scheduled task:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
