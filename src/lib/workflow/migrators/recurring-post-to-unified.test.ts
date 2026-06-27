/**
 * Pure-converter tests for the recurring-post → unified-workflow migrator.
 * No DB I/O.
 */

import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { convertRecurringPost } from './recurring-post-to-unified';
import { WorkflowStatus, WorkflowType } from '../../db/models/unified-workflow.model';

function makeRp(overrides: Partial<Parameters<typeof convertRecurringPost>[0]> = {}) {
  return {
    _id: new Types.ObjectId(),
    brandId: new Types.ObjectId().toString(),
    userId: new Types.ObjectId().toString(),
    title: 'Daily Insight',
    content: 'Posting at 9 every day',
    platforms: ['linkedin'],
    frequency: 'daily' as const,
    timeOfDay: '09:00',
    timezone: 'UTC',
    status: 'active' as const,
    ...overrides,
  };
}

describe('convertRecurringPost', () => {
  it('maps daily frequency to cron at the configured time', () => {
    const { workflow, warnings } = convertRecurringPost(makeRp());
    expect(warnings).toEqual([]);
    const cron = (workflow.trigger?.config as { cronExpression?: string }).cronExpression;
    expect(cron).toBe('00 09 * * *');
  });

  it('maps weekly frequency with dayOfWeek to cron', () => {
    const { workflow } = convertRecurringPost(makeRp({
      frequency: 'weekly',
      dayOfWeek: 3,
      timeOfDay: '15:30',
    }));
    const cron = (workflow.trigger?.config as { cronExpression?: string }).cronExpression;
    expect(cron).toBe('30 15 * * 3');
  });

  it('maps monthly frequency with dayOfMonth to cron', () => {
    const { workflow } = convertRecurringPost(makeRp({
      frequency: 'monthly',
      dayOfMonth: 15,
      timeOfDay: '12:00',
    }));
    const cron = (workflow.trigger?.config as { cronExpression?: string }).cronExpression;
    expect(cron).toBe('00 12 15 * *');
  });

  it('warns when frequency is biweekly (no native cron form)', () => {
    const { warnings } = convertRecurringPost(makeRp({ frequency: 'biweekly', dayOfWeek: 1 }));
    expect(warnings.some(w => /biweekly/i.test(w))).toBe(true);
  });

  it('builds a trigger → publish_social edge', () => {
    const { workflow } = convertRecurringPost(makeRp());
    const triggerNode = workflow.nodes?.find(n => n.type === 'trigger');
    const publishNode = workflow.nodes?.find(n => n.subType === 'publish_social');
    expect(triggerNode).toBeDefined();
    expect(publishNode).toBeDefined();
    const edge = workflow.edges?.find(e => e.source === triggerNode?.id && e.target === publishNode?.id);
    expect(edge).toBeDefined();
  });

  it('maps status to the unified-workflow status enum', () => {
    expect(convertRecurringPost(makeRp({ status: 'active' })).workflow.status).toBe(WorkflowStatus.ACTIVE);
    expect(convertRecurringPost(makeRp({ status: 'paused' })).workflow.status).toBe(WorkflowStatus.PAUSED);
    expect(convertRecurringPost(makeRp({ status: 'completed' })).workflow.status).toBe(WorkflowStatus.ARCHIVED);
  });

  it('stamps migrationMetadata with sourceId and workflow type', () => {
    const rp = makeRp();
    const { workflow } = convertRecurringPost(rp);
    expect(workflow.migrationMetadata?.sourceId?.toString()).toBe(rp._id.toString());
    expect(workflow.type).toBe(WorkflowType.UNIFIED);
  });
});
