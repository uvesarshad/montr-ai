/**
 * Migrator: `crm_workflows` → `unified_workflows`
 *
 * Reads every CRM workflow doc, builds the equivalent unified-workflow doc,
 * and persists it. Idempotent — a unique sparse index on
 * `migrationMetadata.{sourceSystem,sourceId}` guarantees one unified doc per
 * legacy CRM workflow. Re-running the migrator updates the previously created
 * doc instead of creating duplicates.
 *
 * Provides three entry points:
 *   - `convertCrmWorkflow(doc)` — pure converter, no I/O (testable).
 *   - `migrateCrmWorkflows({ dryRun, organizationId? })` — runs the migration.
 *   - `revertCrmMigration({ organizationId? })` — deletes generated unified docs.
 *
 * Cutover playbook:
 *   1. Run `migrateCrmWorkflows({ dryRun: true })` → review report.
 *   2. Run `migrateCrmWorkflows({ dryRun: false })`.
 *   3. Optional: deactivate `crm_workflows` collection writes (B2-1.4).
 *   4. Verify executions on a sample of migrated workflows.
 *   5. If something is wrong: `revertCrmMigration()` then iterate.
 *
 * Coverage of `crm_workflows.WorkflowActionType` is documented in
 * `temp/audit/workflow-node-matrix.md`. Any action this migrator does not
 * recognise is preserved as a sticky-note-style placeholder (a `set_variable`
 * node carrying the original config) so nothing is silently lost — the report
 * surfaces the placeholder so a human can intervene.
 */

import { Types } from 'mongoose';
import CrmWorkflow, {
  ICrmWorkflow,
  IWorkflowAction as ICrmAction,
  IWorkflowCondition as ICrmCondition,
  WorkflowTriggerType,
  WorkflowActionType,
} from '../../db/models/crm/workflow.model';
import {
  UnifiedWorkflow,
  IUnifiedWorkflow,
  IWorkflowNode,
  IWorkflowEdge,
  IWorkflowVariable,
  IWorkflowTrigger,
  WorkflowType,
  WorkflowStatus,
  VariableType,
  VariableScope,
} from '../../db/models/unified-workflow.model';
import { connectMongoose } from '../../mongodb';

export const CRM_MIGRATOR_VERSION = 1;

// ---------------------------------------------------------------------------
// Trigger conversion
// ---------------------------------------------------------------------------

/**
 * CRM trigger type → unified trigger subtype. Every legacy trigger now has a
 * 1:1 unified subtype (deal_won / deal_lost / record_deleted / task_completed
 * landed in the unified enum), so no collapsing is required.
 */
function convertTrigger(crm: ICrmWorkflow): IWorkflowTrigger {
  const t = crm.trigger;
  const baseConfig = {
    entityType: t.entityType,
    field: t.config?.field,
    fromValue: t.config?.fromValue,
    toValue: t.config?.toValue,
    stageId: t.config?.stageId,
    tagId: t.config?.tagId,
    cronExpression: t.config?.schedule,
    webhookPath: t.config?.webhookPath,
  };

  const triggerSubtypeMap: Record<WorkflowTriggerType, string> = {
    record_created: 'record_created',
    record_updated: 'record_updated',
    field_changed: 'field_changed',
    stage_changed: 'stage_changed',
    deal_won: 'deal_won',
    deal_lost: 'deal_lost',
    tag_added: 'tag_added',
    tag_removed: 'tag_removed',
    scheduled: 'scheduled',
    manual: 'manual',
    webhook_received: 'webhook',
  };

  return {
    type: triggerSubtypeMap[t.type] as IWorkflowTrigger['type'],
    config: baseConfig,
  };
}

// ---------------------------------------------------------------------------
// Action → node conversion
// ---------------------------------------------------------------------------

interface NodeBuildContext {
  /** Increments for each new node so positions space out down the canvas. */
  yCursor: number;
  /** Sequential id counter. */
  idCursor: number;
  /** Accumulated warnings — populated when we fall back to a placeholder. */
  warnings: string[];
}

const NODE_HORIZONTAL_GAP = 0;
const NODE_VERTICAL_GAP = 160;
const NODE_X_DEFAULT = 200;

function newNodeId(ctx: NodeBuildContext, prefix: string): string {
  ctx.idCursor += 1;
  return `${prefix}_${ctx.idCursor}`;
}

function newEdgeId(source: string, target: string, label?: string): string {
  return `edge_${source}_${target}${label ? `_${label.replace(/\s+/g, '_')}` : ''}`;
}

function placeNode(ctx: NodeBuildContext): { x: number; y: number } {
  const pos = { x: NODE_X_DEFAULT + NODE_HORIZONTAL_GAP, y: ctx.yCursor };
  ctx.yCursor += NODE_VERTICAL_GAP;
  return pos;
}

/**
 * Translate one CRM action into one or more unified-workflow nodes. Returns
 * the head node id (where upstream edges connect) and tail node id (where
 * downstream edges should originate). For most actions head === tail. For
 * conditional actions the branch creates a fan-out where multiple tails are
 * later merged by the caller.
 */
interface NodeFragment {
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
  headId: string;
  tailIds: string[];
}

function actionToNode(
  action: ICrmAction,
  entityType: ICrmWorkflow['trigger']['entityType'],
  ctx: NodeBuildContext
): NodeFragment {
  switch (action.type) {
    case 'update_field': {
      // Split by entity type — unified has dedicated update_contact / update_deal processors.
      const subType =
        entityType === 'deal' ? 'update_deal' :
        entityType === 'company' ? 'update_contact' : // no update_company processor; document gap
        'update_contact';
      if (entityType === 'company') {
        ctx.warnings.push(
          'Action update_field on company has no dedicated processor; using update_contact subtype as placeholder.'
        );
      }
      const id = newNodeId(ctx, 'update');
      return {
        nodes: [{
          id,
          type: 'action',
          subType,
          position: placeNode(ctx),
          data: {
            label: `Update ${entityType} field`,
            config: {
              field: action.config?.field,
              value: action.config?.value,
            },
          },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'add_tag': {
      const id = newNodeId(ctx, 'add_tag');
      return {
        nodes: [{
          id,
          type: 'action',
          subType: 'add_tag',
          position: placeNode(ctx),
          data: { label: 'Add tag', config: { tagId: action.config?.tagId } },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'remove_tag': {
      const id = newNodeId(ctx, 'remove_tag');
      return {
        nodes: [{
          id,
          type: 'action',
          subType: 'remove_tag',
          position: placeNode(ctx),
          data: { label: 'Remove tag', config: { tagId: action.config?.tagId } },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'assign_owner': {
      const id = newNodeId(ctx, 'assign_owner');
      return {
        nodes: [{
          id,
          type: 'action',
          subType: 'assign_owner',
          position: placeNode(ctx),
          data: {
            label: 'Assign owner',
            config: {
              ownerId: action.config?.ownerId,
              assignmentType: action.config?.assignmentType ?? 'specific',
            },
          },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'create_task': {
      const id = newNodeId(ctx, 'create_task');
      return {
        nodes: [{
          id,
          type: 'action',
          subType: 'create_activity',
          position: placeNode(ctx),
          data: {
            label: 'Create task',
            config: {
              kind: 'task',
              subject: action.config?.subject,
              dueInDays: action.config?.dueInDays,
              assignTo: action.config?.assignTo,
              assignToUserId: action.config?.assignToUserId,
            },
          },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'create_activity': {
      const id = newNodeId(ctx, 'create_activity');
      return {
        nodes: [{
          id,
          type: 'action',
          subType: 'create_activity',
          position: placeNode(ctx),
          data: { label: 'Create activity', config: { ...action.config } },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'send_email': {
      const id = newNodeId(ctx, 'send_email');
      return {
        nodes: [{
          id,
          type: 'action',
          subType: 'send_marketing_email',
          position: placeNode(ctx),
          data: {
            label: 'Send email',
            config: {
              templateId: action.config?.templateId,
              body: action.config?.body,
              from: action.config?.from,
            },
          },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'send_webhook': {
      const id = newNodeId(ctx, 'send_webhook');
      return {
        nodes: [{
          id,
          type: 'integration',
          subType: 'send_webhook',
          position: placeNode(ctx),
          data: {
            label: 'Send webhook',
            config: {
              url: action.config?.url,
              method: action.config?.method ?? 'POST',
              headers: action.config?.headers,
              bodyTemplate: action.config?.bodyTemplate,
            },
          },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'send_whatsapp': {
      const id = newNodeId(ctx, 'send_whatsapp');
      return {
        nodes: [{
          id,
          type: 'action',
          subType: 'send_whatsapp_template',
          position: placeNode(ctx),
          data: {
            label: 'Send WhatsApp template',
            config: {
              templateName: action.config?.templateName,
              templateParams: action.config?.templateParams,
            },
          },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'create_deal': {
      const id = newNodeId(ctx, 'create_deal');
      return {
        nodes: [{
          id,
          type: 'action',
          subType: 'create_deal',
          position: placeNode(ctx),
          data: {
            label: 'Create deal',
            config: {
              pipelineId: action.config?.pipelineId,
              stageId: action.config?.stageId,
              name: action.config?.name,
            },
          },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'move_stage': {
      const id = newNodeId(ctx, 'move_stage');
      return {
        nodes: [{
          id,
          type: 'action',
          subType: 'move_stage',
          position: placeNode(ctx),
          data: { label: 'Move stage', config: { stageId: action.config?.stageId } },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'wait': {
      const totalMs =
        (action.config?.waitDays ?? 0) * 24 * 60 * 60 * 1000 +
        (action.config?.waitHours ?? 0) * 60 * 60 * 1000;
      const id = newNodeId(ctx, 'delay');
      return {
        nodes: [{
          id,
          type: 'control',
          subType: 'delay',
          position: placeNode(ctx),
          data: {
            label: `Delay ${action.config?.waitDays ?? 0}d ${action.config?.waitHours ?? 0}h`,
            config: { delayMs: totalMs },
          },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }

    case 'condition': {
      return conditionToBranch(action, entityType, ctx);
    }

    default: {
      // Belt-and-braces fallback — record the unknown action so nothing is
      // silently lost. Down-the-line execution treats it as a no-op variable set.
      const unknownType: string = (action as { type?: string }).type ?? 'unknown';
      ctx.warnings.push(
        `Unknown CRM action type "${unknownType}" preserved as set_variable placeholder.`
      );
      const id = newNodeId(ctx, 'placeholder');
      return {
        nodes: [{
          id,
          type: 'data',
          subType: 'set_variable',
          position: placeNode(ctx),
          data: {
            label: `Unmigrated: ${unknownType}`,
            config: { variable: `_unmigrated_${unknownType}`, value: action.config },
          },
        }],
        edges: [],
        headId: id,
        tailIds: [id],
      };
    }
  }
}

/**
 * A `condition` CRM action expands into a branch node plus the nested
 * then/else action chains. Both chains terminate at the branch's tails so the
 * caller can rejoin downstream actions.
 */
function conditionToBranch(
  action: ICrmAction,
  entityType: ICrmWorkflow['trigger']['entityType'],
  ctx: NodeBuildContext
): NodeFragment {
  const branchId = newNodeId(ctx, 'branch');
  const branchNode: IWorkflowNode = {
    id: branchId,
    type: 'logic',
    subType: 'branch',
    position: placeNode(ctx),
    data: {
      label: 'Branch',
      config: { conditions: action.config?.conditions ?? [] },
    },
  };

  const nodes: IWorkflowNode[] = [branchNode];
  const edges: IWorkflowEdge[] = [];
  const tailIds: string[] = [];

  const thenActions = action.config?.thenActions ?? [];
  const elseActions = action.config?.elseActions ?? [];

  // Walk a sub-chain off a given branch handle ("true" / "false"). Returns
  // the final node in the chain (the tail).
  const buildSubChain = (
    subActions: ICrmAction[],
    fromNodeId: string,
    handle: 'true' | 'false'
  ): string => {
    let prev = fromNodeId;
    let firstEdge = true;
    for (const sub of subActions) {
      const fragment = actionToNode(sub, entityType, ctx);
      nodes.push(...fragment.nodes);
      edges.push({
        id: newEdgeId(prev, fragment.headId, firstEdge ? handle : undefined),
        source: prev,
        target: fragment.headId,
        sourceHandle: firstEdge ? handle : undefined,
        label: firstEdge ? handle : undefined,
      });
      edges.push(...fragment.edges);
      prev = fragment.tailIds[fragment.tailIds.length - 1];
      firstEdge = false;
    }
    return prev;
  };

  if (thenActions.length > 0) {
    tailIds.push(buildSubChain(thenActions, branchId, 'true'));
  } else {
    tailIds.push(branchId);
  }
  if (elseActions.length > 0) {
    tailIds.push(buildSubChain(elseActions, branchId, 'false'));
  } else {
    tailIds.push(branchId);
  }

  return { nodes, edges, headId: branchId, tailIds };
}

// ---------------------------------------------------------------------------
// Pure converter (no DB I/O — call this from tests)
// ---------------------------------------------------------------------------

export interface ConversionResult {
  workflow: Partial<IUnifiedWorkflow>;
  warnings: string[];
}

export function convertCrmWorkflow(crm: ICrmWorkflow): ConversionResult {
  const ctx: NodeBuildContext = { yCursor: 100, idCursor: 0, warnings: [] };

  // 1. Trigger node anchors the graph so non-trigger nodes have a parent.
  const triggerNodeId = newNodeId(ctx, 'trigger');
  const trigger = convertTrigger(crm);
  const triggerNode: IWorkflowNode = {
    id: triggerNodeId,
    type: 'trigger',
    subType: trigger.type,
    position: placeNode(ctx),
    data: {
      label: `Trigger: ${trigger.type}`,
      config: trigger.config as Record<string, unknown>,
    },
  };

  const nodes: IWorkflowNode[] = [triggerNode];
  const edges: IWorkflowEdge[] = [];

  // 2. Conditions on the workflow itself become a leading guard branch right
  //    after the trigger. The `true` handle carries the action chain; the
  //    `false` handle terminates at an `end` node so non-matching events stop.
  let previousTails: string[] = [triggerNodeId];
  // The handle that the first downstream action edge should attach to.
  let firstActionHandle: 'true' | undefined;
  if (crm.conditions && crm.conditions.length > 0) {
    const guardId = newNodeId(ctx, 'guard');
    nodes.push({
      id: guardId,
      type: 'logic',
      subType: 'branch',
      position: placeNode(ctx),
      data: {
        label: 'Workflow filter',
        config: { conditions: crm.conditions },
      },
    });
    edges.push({
      id: newEdgeId(triggerNodeId, guardId),
      source: triggerNodeId,
      target: guardId,
    });

    // false-path → end node.
    const endId = newNodeId(ctx, 'end');
    nodes.push({
      id: endId,
      type: 'control',
      subType: 'end',
      position: { x: NODE_X_DEFAULT + 240, y: ctx.yCursor },
      data: { label: 'End (filter not matched)', config: {} },
    });
    edges.push({
      id: newEdgeId(guardId, endId, 'false'),
      source: guardId,
      target: endId,
      sourceHandle: 'false',
      label: 'false',
    });

    previousTails = [guardId];
    firstActionHandle = 'true';
  }

  // 3. Walk actions in order, building a linear chain (with branches as needed).
  for (const action of crm.actions ?? []) {
    const fragment = actionToNode(action, crm.trigger.entityType, ctx);
    nodes.push(...fragment.nodes);
    edges.push(...fragment.edges);

    for (const tail of previousTails) {
      edges.push({
        id: newEdgeId(tail, fragment.headId, firstActionHandle),
        source: tail,
        target: fragment.headId,
        sourceHandle: firstActionHandle,
        label: firstActionHandle,
      });
    }
    previousTails = fragment.tailIds;
    // Only the first action attaches to the guard's `true` handle.
    firstActionHandle = undefined;
  }

  // 4. Build the unified-workflow doc.
  const variables: IWorkflowVariable[] = [];
  if (crm.cooldownMinutes) {
    variables.push({
      key: 'cooldownMinutes',
      label: 'Cooldown (minutes)',
      type: VariableType.NUMBER,
      scope: VariableScope.WORKFLOW,
      value: crm.cooldownMinutes,
    });
  }

  const workflow: Partial<IUnifiedWorkflow> = {
    name: crm.name,
    description: crm.description ?? `Migrated from crm_workflows ${crm._id}`,
    type: WorkflowType.CRM,
    status: crm.isActive ? WorkflowStatus.ACTIVE : WorkflowStatus.DRAFT,
    createdById: crm.createdById,
    trigger,
    nodes,
    edges,
    variables,
    errorHandling: {
      retryEnabled: false,
      maxRetries: 3,
      retryDelay: 1000,
      retryBackoff: 'exponential',
      onErrorAction: 'stop',
    },
    credentials: [],
    runOnce: !!crm.runOnce,
    maxExecutions: crm.maxExecutions,
    cooldownMinutes: crm.cooldownMinutes,
    timeout: 300,
    enableParallel: true,
    enableLoops: true,
    executionCount: crm.executionCount ?? 0,
    successCount: Math.max(0, (crm.executionCount ?? 0) - (crm.errorCount ?? 0)),
    failureCount: crm.errorCount ?? 0,
    lastExecutedAt: crm.lastExecutedAt,
    isTemplate: false,
    version: 1,
    migrationMetadata: {
      sourceSystem: 'crm_workflow',
      sourceId: crm._id as Types.ObjectId,
      migratedAt: new Date(),
      migratorVersion: CRM_MIGRATOR_VERSION,
    },
  };

  return { workflow, warnings: ctx.warnings };
}

// ---------------------------------------------------------------------------
// Bulk migration entry point
// ---------------------------------------------------------------------------

export interface MigrationOptions {
  /** If true, no writes are performed. Returns the would-be report. */
  dryRun: boolean;
}

export interface MigrationReport {
  dryRun: boolean;
  totalSourceDocs: number;
  alreadyMigrated: number;
  created: number;
  updated: number;
  warnings: Array<{ crmWorkflowId: string; warnings: string[] }>;
  errors: Array<{ crmWorkflowId: string; error: string }>;
}

export async function migrateCrmWorkflows(
  options: MigrationOptions
): Promise<MigrationReport> {
  await connectMongoose();

  const filter: Record<string, unknown> = {};
  const sourceDocs = await CrmWorkflow.find(filter).lean<ICrmWorkflow[]>().exec();

  const report: MigrationReport = {
    dryRun: options.dryRun,
    totalSourceDocs: sourceDocs.length,
    alreadyMigrated: 0,
    created: 0,
    updated: 0,
    warnings: [],
    errors: [],
  };

  for (const sourceDoc of sourceDocs) {
    try {
      const { workflow, warnings } = convertCrmWorkflow(sourceDoc);
      if (warnings.length > 0) {
        report.warnings.push({
          crmWorkflowId: String(sourceDoc._id),
          warnings,
        });
      }

      const existing = await UnifiedWorkflow.findOne({
        'migrationMetadata.sourceSystem': 'crm_workflow',
        'migrationMetadata.sourceId': sourceDoc._id,
      });

      if (existing) report.alreadyMigrated += 1;

      if (!options.dryRun) {
        if (existing) {
          // Idempotent update — preserve _id, replace the rest.
          Object.assign(existing, workflow);
          await existing.save();
          report.updated += 1;
        } else {
          await UnifiedWorkflow.create(workflow);
          report.created += 1;
        }
      }
    } catch (error) {
      report.errors.push({
        crmWorkflowId: String(sourceDoc._id),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// Revert
// ---------------------------------------------------------------------------

export interface RevertOptions {
}

export interface RevertReport {
  deleted: number;
}

export async function revertCrmMigration(
  options: RevertOptions = {}
): Promise<RevertReport> {
  await connectMongoose();
  const filter: Record<string, unknown> = {
    'migrationMetadata.sourceSystem': 'crm_workflow',
  };
  const result = await UnifiedWorkflow.deleteMany(filter);
  return { deleted: result.deletedCount ?? 0 };
}

// Type assertion helper — silence unused-symbol warning for the type union
// import (some action types are referenced only for their string literal values).
type _UseWorkflowActionType = WorkflowActionType;
const _useWorkflowActionType: _UseWorkflowActionType = 'add_tag';
void _useWorkflowActionType;
void ({} as ICrmCondition);
