import mongoose from 'mongoose';

import {
  DEFAULT_MISSION_TITLE,
  deriveMissionSummary,
  getMissionTitleFromPrompt,
} from '@/lib/agent/missions';
import AgentMission, {
  AgentMissionMode,
  AgentMissionStatus,
  IAgentMission,
} from '@/lib/db/models/agent-mission.model';
import AgentMissionEvent, {
  AgentMissionEventRole,
  AgentMissionEventType,
  IAgentMissionEvent,
} from '@/lib/db/models/agent-mission-event.model';
import AgentMissionLink, {
  IAgentMissionLink,
} from '@/lib/db/models/agent-mission-link.model';
import PendingAgentAction from '@/lib/db/models/pending-agent-action.model';
import AgentScheduledTask from '@/lib/db/models/agent-scheduled-task.model';

export interface FindAgentMissionsOptions {
  brandId?: string;
  search?: string;
  statuses?: AgentMissionStatus[];
  limit?: number;
  offset?: number;
}

export interface CreateAgentMissionDto {
  brandId: string;
  userId: string;
  parentMissionId?: string;
  templateId?: string;
  strategyId?: string;
  chainedFromMissionId?: string;
  title?: string;
  summary?: string;
  status?: AgentMissionStatus;
  mode?: AgentMissionMode;
  activeAgentId?: string;
  currentSessionId?: string;
  limits?: Partial<import('@/lib/db/models/agent-mission.model').AgentMissionLimits>;
}

export interface UpdateAgentMissionDto {
  title?: string;
  summary?: string;
  status?: AgentMissionStatus;
  mode?: AgentMissionMode;
  /** Start of the current wake/interaction session — base for the per-session wall-clock budget. */
  sessionStartedAt?: Date;
  terminatedReason?: null;
  activeAgentId?: string;
  currentSessionId?: string;
  lastActivityAt?: Date;
}

export interface AppendAgentMissionEventDto {
  missionId: string;
  brandId: string;
  userId: string;
  sessionId?: string;
  type: AgentMissionEventType;
  role?: AgentMissionEventRole;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateAgentMissionLinkDto {
  missionId: string;
  brandId: string;
  userId: string;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  targetRoute?: string;
  metadata?: Record<string, unknown>;
}

function truncatePreview(value?: string | null, maxLength: number = 240) {
  if (!value) {
    return '';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function isMissionStatus(value: unknown): value is AgentMissionStatus {
  return ['draft', 'active', 'waiting', 'scheduled', 'blocked', 'completed'].includes(String(value));
}

export class AgentMissionRepository {
  async findByUserContext(
    userId: string,
    options: FindAgentMissionsOptions = {}
  ): Promise<IAgentMission[]> {
    await this.ensureConnection();

    const query: Record<string, unknown> = {
      userId,
    };

    if (options.brandId) {
      query.brandId = options.brandId;
    }

    if (options.statuses?.length) {
      query.status = { $in: options.statuses };
    }

    if (options.search) {
      query.$or = [
        { title: { $regex: options.search, $options: 'i' } },
        { summary: { $regex: options.search, $options: 'i' } },
        { latestUserMessage: { $regex: options.search, $options: 'i' } },
        { latestAssistantMessage: { $regex: options.search, $options: 'i' } },
      ];
    }

    let findQuery = AgentMission.find(query).sort({ lastActivityAt: -1 });

    if (options.offset) {
      findQuery = findQuery.skip(options.offset);
    }

    if (options.limit) {
      findQuery = findQuery.limit(options.limit);
    }

    return findQuery.exec();
  }

  async countByUserContext(
    userId: string,
    options: Omit<FindAgentMissionsOptions, 'limit' | 'offset'> = {}
  ) {
    await this.ensureConnection();

    const query: Record<string, unknown> = {
      userId,
    };

    if (options.brandId) {
      query.brandId = options.brandId;
    }

    if (options.statuses?.length) {
      query.status = { $in: options.statuses };
    }

    if (options.search) {
      query.$or = [
        { title: { $regex: options.search, $options: 'i' } },
        { summary: { $regex: options.search, $options: 'i' } },
      ];
    }

    return AgentMission.countDocuments(query).exec();
  }

  async findLatestByUserContext(userId: string, brandId?: string) {
    await this.ensureConnection();

    const query: Record<string, unknown> = {
      userId,
    };

    if (brandId) {
      query.brandId = brandId;
    }

    return AgentMission.findOne(query).sort({ lastActivityAt: -1 }).exec();
  }

  async findById(missionId: string, userId: string) {
    await this.ensureConnection();
    return AgentMission.findOne({ _id: missionId, userId }).exec();
  }

  async findByParentId(parentMissionId: string) {
    await this.ensureConnection();
    return AgentMission.find({ parentMissionId })
      .sort({ createdAt: 1 })
      .select('_id title status activeAgentId createdAt')
      .lean()
      .exec();
  }

  async create(data: CreateAgentMissionDto) {
    await this.ensureConnection();

    const mission = new AgentMission({
      brandId: data.brandId,
      userId: data.userId,
      parentMissionId: data.parentMissionId ?? null,
      templateId: data.templateId ?? null,
      strategyId: data.strategyId ?? null,
      chainedFromMissionId: data.chainedFromMissionId ?? null,
      title: data.title || DEFAULT_MISSION_TITLE,
      summary: data.summary || 'Mission ready to begin.',
      status: data.status || 'draft',
      mode: data.mode || 'mixed',
      activeAgentId: data.activeAgentId || 'general-agent',
      currentSessionId: data.currentSessionId || '',
      lastActivityAt: new Date(),
      ...(data.limits ? { limits: data.limits } : {}),
    });

    return mission.save();
  }

  async update(missionId: string, userId: string, data: UpdateAgentMissionDto) {
    await this.ensureConnection();

    return AgentMission.findOneAndUpdate(
      { _id: missionId, userId },
      { $set: data },
      { new: true }
    ).exec();
  }

  async appendEvent(data: AppendAgentMissionEventDto): Promise<IAgentMissionEvent | null> {
    await this.ensureConnection();

    const mission = await this.findById(data.missionId, data.userId);
    if (!mission) {
      return null;
    }

    const event = await AgentMissionEvent.create({
      missionId: data.missionId,
      brandId: data.brandId,
      userId: data.userId,
      sessionId: data.sessionId,
      type: data.type,
      role: data.role,
      content: data.content,
      metadata: data.metadata,
    });

    const updateData: Record<string, unknown> = {
      lastActivityAt: event.createdAt,
    };
    const incrementData: Record<string, number> = {
      eventCount: 1,
    };

    if (data.sessionId) {
      updateData.currentSessionId = data.sessionId;
    }

    if (data.type === 'message') {
      incrementData.messageCount = 1;
      updateData.status = 'active';

      const preview = truncatePreview(data.content, 500);

      if (data.role === 'user') {
        if (preview) {
          updateData.latestUserMessage = preview;
        }

        if (!mission.title || mission.title === DEFAULT_MISSION_TITLE) {
          updateData.title = getMissionTitleFromPrompt(data.content ?? '');
        }

        updateData.summary = deriveMissionSummary([
          { role: 'user', content: data.content ?? '' },
          ...(mission.latestAssistantMessage
            ? [{ role: 'assistant' as const, content: mission.latestAssistantMessage }]
            : []),
        ]);
      }

      if (data.role === 'assistant') {
        if (preview) {
          updateData.latestAssistantMessage = preview;
        }

        updateData.summary = deriveMissionSummary([
          ...(mission.latestUserMessage
            ? [{ role: 'user' as const, content: mission.latestUserMessage }]
            : []),
          { role: 'assistant', content: data.content ?? '' },
        ]);
      }
    }

    if (data.type === 'approval_request') {
      updateData.status = 'waiting';
    }

    if (data.type === 'scheduled_action') {
      updateData.status = 'scheduled';
    }

    if (data.type === 'error') {
      updateData.status = 'blocked';
    }

    if (data.type === 'status_change' && isMissionStatus(data.metadata?.status)) {
      updateData.status = data.metadata.status;
    }

    if (data.metadata?.activeAgentId && typeof data.metadata.activeAgentId === 'string') {
      updateData.activeAgentId = data.metadata.activeAgentId;
    }

    await AgentMission.findOneAndUpdate(
      { _id: data.missionId, userId: data.userId },
      {
        $set: updateData,
        $inc: incrementData,
      },
      { new: true }
    ).exec();

    return event;
  }

  async listEvents(missionId: string, userId: string, limit: number = 100) {
    await this.ensureConnection();

    return AgentMissionEvent.find({ missionId, userId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  async createLink(data: CreateAgentMissionLinkDto) {
    await this.ensureConnection();

    return AgentMissionLink.findOneAndUpdate(
      {
        missionId: data.missionId,
        userId: data.userId,
        targetType: data.targetType,
        targetId: data.targetId,
      },
      {
        $set: {
          brandId: data.brandId,
          targetLabel: data.targetLabel,
          targetRoute: data.targetRoute,
          metadata: data.metadata,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).exec();
  }

  async listLinks(missionId: string, userId: string): Promise<IAgentMissionLink[]> {
    await this.ensureConnection();

    return AgentMissionLink.find({ missionId, userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async delete(missionId: string, userId: string) {
    await this.ensureConnection();

    const mission = await AgentMission.findOneAndDelete({ _id: missionId, userId }).exec();
    if (!mission) {
      return null;
    }

    await Promise.allSettled([
      AgentMissionEvent.deleteMany({ missionId, userId }).exec(),
      AgentMissionLink.deleteMany({ missionId, userId }).exec(),
      PendingAgentAction.deleteMany({ missionId, userId }).exec(),
      AgentScheduledTask.deleteMany({ missionId, userId }).exec(),
    ]);

    return mission;
  }

  private async ensureConnection() {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }
}

export const agentMissionRepository = new AgentMissionRepository();
