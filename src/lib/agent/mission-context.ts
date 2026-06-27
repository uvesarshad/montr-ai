import { AgentMissionStatus } from '@/lib/db/models/agent-mission.model';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type ScheduledTaskStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface MissionContextApprovalInput {
  _id: string;
  toolName: string;
  toolDescription: string;
  status: ApprovalStatus;
  createdAt: string | Date;
  expiresAt?: string | Date;
}

export interface MissionContextScheduledTaskInput {
  _id: string;
  name: string;
  description: string;
  status: ScheduledTaskStatus;
  nextRunAt?: string | Date;
}

export interface MissionContextLinkInput {
  _id: string;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  targetRoute?: string;
}

export interface MissionContextStatusInput {
  missionStatus: AgentMissionStatus;
  pendingApprovalCount: number;
  queuedRunCount: number;
  failedTaskCount: number;
}

function toTimestamp(value?: string | Date) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime();
}

export function getMissionContextStatus(input: MissionContextStatusInput): AgentMissionStatus {
  if (input.failedTaskCount > 0) {
    return 'blocked';
  }

  if (input.pendingApprovalCount > 0) {
    return 'waiting';
  }

  if (input.queuedRunCount > 0) {
    return 'scheduled';
  }

  return input.missionStatus;
}

export function buildMissionContextSummary(input: {
  missionStatus: AgentMissionStatus;
  approvals: MissionContextApprovalInput[];
  scheduledTasks: MissionContextScheduledTaskInput[];
  links: MissionContextLinkInput[];
}) {
  const approvals = input.approvals
    .filter((approval) => approval.status === 'pending')
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
    .map((approval) => ({
      id: approval._id,
      toolName: approval.toolName,
      description: approval.toolDescription,
      expiresAt: approval.expiresAt,
      createdAt: approval.createdAt,
    }));

  const scheduledTasks = input.scheduledTasks
    .filter((task) => task.status === 'active')
    .sort((left, right) => toTimestamp(left.nextRunAt) - toTimestamp(right.nextRunAt))
    .map((task) => ({
      id: task._id,
      name: task.name,
      description: task.description,
      nextRunAt: task.nextRunAt,
      status: task.status,
    }));

  const failedTaskCount = input.scheduledTasks.filter((task) => task.status === 'failed').length;
  const pendingApprovalCount = approvals.length;
  const queuedRunCount = scheduledTasks.length;

  return {
    approvals,
    scheduledTasks,
    linkedAssetCount: input.links.length,
    pendingApprovalCount,
    queuedRunCount,
    failedTaskCount,
    status: getMissionContextStatus({
      missionStatus: input.missionStatus,
      pendingApprovalCount,
      queuedRunCount,
      failedTaskCount,
    }),
  };
}
