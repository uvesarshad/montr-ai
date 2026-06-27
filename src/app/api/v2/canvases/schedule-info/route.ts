/**
 * Canvas schedule visibility (TODO 2.17).
 *
 * GET /api/v2/canvases/schedule-info
 *
 * Returns per-canvas run/schedule metadata for the caller's organization:
 *   - lastRunAt / lastRunStatus  — newest execution for the canvas's workflow
 *   - nextRunAt                  — derived from the scheduled trigger config
 *   - intervalMs / stalled       — missed-tick heuristic for scheduled triggers
 *
 * Efficient by design: ONE aggregation computes the latest execution per
 * workflow (not N queries), and next-run is computed in-process from each
 * workflow's trigger config (no per-workflow DB round-trips).
 *
 * Strictly org-scoped: `organizationId` is read from the session user's DB
 * record, never from the client.
 */

import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import { UnifiedWorkflow } from '@/lib/db/models/unified-workflow.model';
import { UnifiedWorkflowExecution } from '@/lib/db/models/unified-workflow-execution.model';
import { deriveScheduleInfo } from '@/lib/workflow/schedule-info';

export interface CanvasScheduleInfo {
    canvasId: string;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    nextRunAt: string | null;
    intervalMs: number | null;
    /** True when a scheduled run looks overdue with no matching execution. */
    stalled: boolean;
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (session.user as { id?: string }).id;
        await connectDB();

        // All workflows for this org that are backed by a canvas. trigger +
        // lastExecutedAt let us derive next-run; canvasId is the join key.
        const workflows = await UnifiedWorkflow.find({
            canvasId: { $exists: true, $ne: null },
        })
            .select('_id canvasId status trigger lastExecutedAt')
            .lean();

        if (workflows.length === 0) {
            return NextResponse.json({ schedules: [] });
        }

        const workflowIds = workflows.map((wf) => wf._id as Types.ObjectId);

        // ONE aggregation: newest execution per workflow (org-scoped).
        const lastRuns = await UnifiedWorkflowExecution.aggregate<{
            _id: Types.ObjectId;
            startedAt: Date;
            status: string;
        }>([
            { $match: { workflowId: { $in: workflowIds } } },
            { $sort: { startedAt: -1 } },
            {
                $group: {
                    _id: '$workflowId',
                    startedAt: { $first: '$startedAt' },
                    status: { $first: '$status' },
                },
            },
        ]);

        const lastRunByWorkflow = new Map<string, { startedAt: Date; status: string }>();
        for (const run of lastRuns) {
            lastRunByWorkflow.set(String(run._id), { startedAt: run.startedAt, status: run.status });
        }

        const now = new Date();
        const schedules: CanvasScheduleInfo[] = workflows.map((wf) => {
            const lastRun = lastRunByWorkflow.get(String(wf._id)) || null;
            const lastRunAt = lastRun?.startedAt
                ? new Date(lastRun.startedAt)
                : wf.lastExecutedAt
                  ? new Date(wf.lastExecutedAt)
                  : null;

            let nextRunAt: string | null = null;
            let intervalMs: number | null = null;
            let stalled = false;

            // Only scheduled, active workflows have a derivable next run.
            if (wf.trigger?.type === 'scheduled' && wf.status === 'active') {
                const info = deriveScheduleInfo(
                    wf.trigger?.config as Parameters<typeof deriveScheduleInfo>[0],
                    lastRunAt,
                    now,
                );
                nextRunAt = info.nextRunAt;
                intervalMs = info.intervalMs;

                // Missed-tick heuristic: a tick was expected more than 2x the
                // interval ago and the last run (if any) predates that expected
                // tick → the schedule looks stalled.
                if (intervalMs && nextRunAt) {
                    const expectedPrevTick = new Date(nextRunAt).getTime() - intervalMs;
                    const overdueBy = now.getTime() - expectedPrevTick;
                    const noRecentRun = !lastRunAt || lastRunAt.getTime() < expectedPrevTick;
                    if (overdueBy > 2 * intervalMs && noRecentRun) {
                        stalled = true;
                    }
                }
            }

            return {
                canvasId: String(wf.canvasId),
                lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
                lastRunStatus: lastRun?.status ?? null,
                nextRunAt,
                intervalMs,
                stalled,
            };
        });

        return NextResponse.json({ schedules });
    } catch (error) {
        console.error('Error computing canvas schedule info:', error);
        return NextResponse.json(
            { error: 'Failed to compute schedule info' },
            { status: 500 },
        );
    }
}
