/**
 * Migrator: `recurring_posts` → `unified_workflows`
 *
 * Audit (B2-4.3): the recurring-post model duplicates what a unified-workflow
 * with a `scheduled` trigger + `publish_social` action already expresses.
 * - `frequency` (daily/weekly/biweekly/monthly) maps cleanly to a cron expression.
 * - `dayOfWeek` / `dayOfMonth` / `timeOfDay` / `timezone` become cron fields.
 * - `nextRunAt` / `totalRuns` become the unified-workflow scheduler's repeatable-job
 *   state — no separate "next run" math needed.
 * - `maxRuns` maps to unified-workflow's `maxExecutions`.
 *
 * This module provides the converter only — bulk migration runs are gated on
 * the user's go-ahead (recurring posts are user-facing, surprise migrations are
 * disruptive).
 */

import { Types } from 'mongoose';
import {
  IUnifiedWorkflow,
  IWorkflowNode,
  IWorkflowEdge,
  IWorkflowTrigger,
  WorkflowType,
  WorkflowStatus,
} from '../../db/models/unified-workflow.model';

export const RECURRING_POST_MIGRATOR_VERSION = 1;

interface RecurringPostLike {
  _id: Types.ObjectId;
  brandId: string;
  userId: string;
  title: string;
  content: string;
  media?: Array<{ url: string; type: 'image' | 'video'; altText?: string }>;
  platforms: string[];
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string; // "HH:mm"
  timezone: string;
  maxRuns?: number;
  status: 'active' | 'paused' | 'completed';
}

/**
 * Build a cron expression from the recurring-post fields. BullMQ's repeatable
 * job runner consumes 5-field cron (no seconds).
 */
function cronFor(rp: RecurringPostLike): string {
  const [hhStr, mmStr] = (rp.timeOfDay || '09:00').split(':');
  const minute = mmStr ?? '0';
  const hour = hhStr ?? '9';

  switch (rp.frequency) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly': {
      const dow = rp.dayOfWeek ?? 1; // Default Monday
      return `${minute} ${hour} * * ${dow}`;
    }
    case 'biweekly': {
      // Cron has no native biweekly. Approximate with every 14 days from day 1.
      // BullMQ scheduler honors a custom `every` interval — biweekly is best
      // expressed there, but for the canonical cron form we fall back to
      // weekly with a runtime guard (caller can drop alternate weeks).
      const dow = rp.dayOfWeek ?? 1;
      return `${minute} ${hour} * * ${dow}`;
    }
    case 'monthly': {
      const dom = rp.dayOfMonth ?? 1;
      return `${minute} ${hour} ${dom} * *`;
    }
  }
}

export interface ConversionResult {
  workflow: Partial<IUnifiedWorkflow>;
  warnings: string[];
}

export function convertRecurringPost(rp: RecurringPostLike): ConversionResult {
  const warnings: string[] = [];
  if (rp.frequency === 'biweekly') {
    warnings.push(
      'biweekly frequency has no native cron representation — migrated as weekly. ' +
        'Apply runtime "skip alternate week" guard or use the BullMQ `every` interval instead.'
    );
  }

  // 1. Trigger.
  const trigger: IWorkflowTrigger = {
    type: 'scheduled',
    config: {
      cronExpression: cronFor(rp),
      timezone: rp.timezone,
      isRecurring: true,
    },
  };

  // 2. Single publish_social node.
  const publishNode: IWorkflowNode = {
    id: 'publish_1',
    type: 'action',
    subType: 'publish_social',
    position: { x: 200, y: 100 },
    data: {
      label: 'Publish to social',
      config: {
        platforms: rp.platforms,
        content: rp.content,
        media: rp.media ?? [],
      },
    },
  };

  // 3. Trigger node anchors the graph.
  const triggerNode: IWorkflowNode = {
    id: 'trigger_1',
    type: 'trigger',
    subType: 'scheduled',
    position: { x: 200, y: 0 },
    data: {
      label: 'Recurring schedule',
      config: trigger.config as Record<string, unknown>,
    },
  };

  const edges: IWorkflowEdge[] = [
    {
      id: 'edge_trigger_1_publish_1',
      source: triggerNode.id,
      target: publishNode.id,
    },
  ];

  const statusMap: Record<RecurringPostLike['status'], WorkflowStatus> = {
    active: WorkflowStatus.ACTIVE,
    paused: WorkflowStatus.PAUSED,
    completed: WorkflowStatus.ARCHIVED,
  };

  // brandId is stored as a string on recurring-post; new unified docs use it as
  // an ObjectId (per agency-mode discipline). Cast — invalid ids surface at
  // save time with a Mongoose error so the caller can correct.
  const workflow: Partial<IUnifiedWorkflow> = {
    name: rp.title || `Recurring post ${rp._id}`,
    description: `Migrated from recurring_posts ${rp._id}`,
    type: WorkflowType.UNIFIED,
    status: statusMap[rp.status], // best-effort; admin reconciles
    createdById: new Types.ObjectId(rp.userId),
    trigger,
    nodes: [triggerNode, publishNode],
    edges,
    variables: [],
    errorHandling: {
      retryEnabled: false,
      maxRetries: 3,
      retryDelay: 1000,
      retryBackoff: 'exponential',
      onErrorAction: 'stop',
    },
    credentials: [],
    runOnce: false,
    maxExecutions: rp.maxRuns,
    timeout: 300,
    enableParallel: true,
    enableLoops: true,
    isTemplate: false,
    version: 1,
    migrationMetadata: {
      sourceSystem: 'crm_workflow', // recurring_post not in enum yet — falls into "other" bucket
      sourceId: rp._id,
      migratedAt: new Date(),
      migratorVersion: RECURRING_POST_MIGRATOR_VERSION,
    },
  };

  return { workflow, warnings };
}
