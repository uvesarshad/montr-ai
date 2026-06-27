
import { it, expect } from 'vitest';
import {
  buildMissionContextSummary,
  getMissionContextStatus,
} from './mission-context';

it('getMissionContextStatus prioritizes pending approvals over other context states', () => {
  const status = getMissionContextStatus({
    missionStatus: 'active',
    pendingApprovalCount: 2,
    queuedRunCount: 1,
    failedTaskCount: 0,
  });

  expect(status).toBe('waiting');
});

it('getMissionContextStatus falls back to scheduled when queued runs exist', () => {
  const status = getMissionContextStatus({
    missionStatus: 'active',
    pendingApprovalCount: 0,
    queuedRunCount: 3,
    failedTaskCount: 0,
  });

  expect(status).toBe('scheduled');
});

it('buildMissionContextSummary filters pending approvals and sorts scheduled tasks by next run', () => {
  const summary = buildMissionContextSummary({
    missionStatus: 'active',
    approvals: [
      {
        _id: 'approval-1',
        toolName: 'sendEmail',
        toolDescription: 'Send product launch email to 54 customers',
        status: 'approved',
        createdAt: '2026-04-02T08:00:00.000Z',
        expiresAt: '2026-04-03T08:00:00.000Z',
      },
      {
        _id: 'approval-2',
        toolName: 'triggerWorkflow',
        toolDescription: 'Trigger onboarding workflow for enterprise trial users',
        status: 'pending',
        createdAt: '2026-04-02T09:00:00.000Z',
        expiresAt: '2026-04-03T09:00:00.000Z',
      },
    ],
    scheduledTasks: [
      {
        _id: 'task-1',
        name: 'Weekly win report',
        description: 'Compile and send a weekly summary',
        status: 'active',
        nextRunAt: '2026-04-04T09:00:00.000Z',
      },
      {
        _id: 'task-2',
        name: 'Daily follow-up',
        description: 'Nudge stale leads every morning',
        status: 'active',
        nextRunAt: '2026-04-03T09:00:00.000Z',
      },
      {
        _id: 'task-3',
        name: 'Paused sync',
        description: 'Do not run while paused',
        status: 'paused',
        nextRunAt: '2026-04-02T12:00:00.000Z',
      },
    ],
    links: [
      {
        _id: 'link-1',
        targetType: 'draft',
        targetId: 'draft-1',
        targetLabel: 'Launch draft',
      },
    ],
  });

  expect(summary.pendingApprovalCount).toBe(1);
  expect(summary.queuedRunCount).toBe(2);
  expect(summary.linkedAssetCount).toBe(1);
  expect(summary.status).toBe('waiting');
  expect(summary.approvals[0]?.id).toBe('approval-2');
  expect(summary.scheduledTasks[0]?.id).toBe('task-2');
  expect(summary.scheduledTasks[1]?.id).toBe('task-1');
});

it('buildMissionContextSummary flags blocked status when scheduled task failures exist', () => {
  const summary = buildMissionContextSummary({
    missionStatus: 'active',
    approvals: [],
    scheduledTasks: [
      {
        _id: 'task-4',
        name: 'Broken sync',
        description: 'This task failed last run',
        status: 'failed',
        nextRunAt: '2026-04-04T09:00:00.000Z',
      },
    ],
    links: [],
  });

  expect(summary.failedTaskCount).toBe(1);
  expect(summary.status).toBe('blocked');
});
