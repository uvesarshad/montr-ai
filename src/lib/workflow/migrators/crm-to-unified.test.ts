/**
 * Pure-converter tests for the crm_workflows → unified-workflow migrator.
 * No DB I/O — exercises `convertCrmWorkflow` in isolation.
 */

import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { convertCrmWorkflow } from './crm-to-unified';
import { WorkflowStatus, WorkflowType } from '../../db/models/unified-workflow.model';
import type { ICrmWorkflow } from '../../db/models/crm/workflow.model';

function makeCrm(overrides: Partial<ICrmWorkflow> = {}): ICrmWorkflow {
  return {
    _id: new Types.ObjectId(),
    organizationId: new Types.ObjectId(),
    createdById: new Types.ObjectId(),
    name: 'Test workflow',
    isActive: true,
    trigger: {
      type: 'record_created',
      entityType: 'contact',
      config: {},
    },
    conditions: [],
    actions: [],
    runOnce: false,
    executionCount: 0,
    errorCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ICrmWorkflow;
}

describe('convertCrmWorkflow', () => {
  it('produces an active, CRM-typed unified workflow with migration metadata', () => {
    const crm = makeCrm();
    const { workflow, warnings } = convertCrmWorkflow(crm);
    expect(warnings).toEqual([]);
    expect(workflow.type).toBe(WorkflowType.CRM);
    expect(workflow.status).toBe(WorkflowStatus.ACTIVE);
    expect(workflow.migrationMetadata?.sourceSystem).toBe('crm_workflow');
    expect(workflow.migrationMetadata?.sourceId?.toString()).toBe(crm._id?.toString());
  });

  it('maps deal_won trigger 1:1 to the unified deal_won subtype', () => {
    const crm = makeCrm({
      trigger: { type: 'deal_won', entityType: 'deal', config: {} },
    });
    const { workflow } = convertCrmWorkflow(crm);
    expect(workflow.trigger?.type).toBe('deal_won');
    expect((workflow.trigger?.config as { entityType?: string })?.entityType).toBe('deal');
  });

  it('splits update_field into update_contact / update_deal by entityType', () => {
    const crm = makeCrm({
      trigger: { type: 'stage_changed', entityType: 'deal', config: {} },
      actions: [
        { type: 'update_field', config: { field: 'priority', value: 'high' } },
      ],
    });
    const { workflow } = convertCrmWorkflow(crm);
    const updateNode = workflow.nodes?.find(n => n.subType === 'update_deal');
    expect(updateNode).toBeDefined();
    expect(updateNode?.data?.config).toMatchObject({ field: 'priority', value: 'high' });
  });

  it('converts wait action to control delay node with computed ms', () => {
    const crm = makeCrm({
      actions: [{ type: 'wait', config: { waitDays: 1, waitHours: 2 } }],
    });
    const { workflow } = convertCrmWorkflow(crm);
    const delayNode = workflow.nodes?.find(n => n.subType === 'delay');
    expect(delayNode?.type).toBe('control');
    const expectedMs = 1 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000;
    expect((delayNode?.data?.config as { delayMs?: number })?.delayMs).toBe(expectedMs);
  });

  it('expands a condition action into a branch node with then/else sub-chains', () => {
    const crm = makeCrm({
      actions: [
        {
          type: 'condition',
          config: {
            conditions: [{ field: 'status', operator: 'equals', value: 'open', conjunction: 'and' }],
            thenActions: [{ type: 'add_tag', config: { tagId: new Types.ObjectId() } }],
            elseActions: [{ type: 'remove_tag', config: { tagId: new Types.ObjectId() } }],
          },
        },
      ],
    });
    const { workflow } = convertCrmWorkflow(crm);
    const branch = workflow.nodes?.find(n => n.subType === 'branch');
    expect(branch).toBeDefined();
    // Edges from the branch carry the handle label
    const trueEdge = workflow.edges?.find(e => e.source === branch?.id && e.sourceHandle === 'true');
    const falseEdge = workflow.edges?.find(e => e.source === branch?.id && e.sourceHandle === 'false');
    expect(trueEdge).toBeDefined();
    expect(falseEdge).toBeDefined();
    // Then sub-chain leads to add_tag, else sub-chain leads to remove_tag
    const addTagNode = workflow.nodes?.find(n => n.subType === 'add_tag');
    const removeTagNode = workflow.nodes?.find(n => n.subType === 'remove_tag');
    expect(trueEdge?.target).toBe(addTagNode?.id);
    expect(falseEdge?.target).toBe(removeTagNode?.id);
  });

  it('emits a leading guard branch when CRM-level conditions are present', () => {
    const crm = makeCrm({
      conditions: [{ field: 'status', operator: 'equals', value: 'open', conjunction: 'and' }],
      actions: [{ type: 'add_tag', config: { tagId: new Types.ObjectId() } }],
    });
    const { workflow } = convertCrmWorkflow(crm);
    const guard = workflow.nodes?.find(
      n => n.subType === 'branch' && n.data?.label === 'Workflow filter'
    );
    expect(guard?.type).toBe('logic');
    expect((guard?.data?.config as { conditions?: unknown[] })?.conditions).toHaveLength(1);
    // Trigger → guard; guard true-path → add_tag; guard false-path → end
    const guardIncoming = workflow.edges?.find(e => e.target === guard?.id);
    expect(guardIncoming).toBeDefined();
    const addTagNode = workflow.nodes?.find(n => n.subType === 'add_tag');
    const trueEdge = workflow.edges?.find(
      e => e.source === guard?.id && e.sourceHandle === 'true'
    );
    expect(trueEdge?.target).toBe(addTagNode?.id);
    const endNode = workflow.nodes?.find(n => n.subType === 'end');
    const falseEdge = workflow.edges?.find(
      e => e.source === guard?.id && e.sourceHandle === 'false'
    );
    expect(falseEdge?.target).toBe(endNode?.id);
  });

  it('preserves unknown action types as a set_variable placeholder and surfaces a warning', () => {
    const crm = makeCrm({
      actions: [{ type: 'totally_made_up_action' as never, config: { some: 'value' } }],
    });
    const { workflow, warnings } = convertCrmWorkflow(crm);
    expect(warnings.length).toBeGreaterThan(0);
    const placeholder = workflow.nodes?.find(n => n.subType === 'set_variable');
    expect(placeholder).toBeDefined();
    expect((placeholder?.data?.config as { variable?: string })?.variable).toContain('_unmigrated_');
  });
});
