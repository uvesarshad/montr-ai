/**
 * Migrator: `whatsapp_workflows` → `unified_workflows`
 *
 * The legacy WhatsApp builder already stored a node graph, so the heavy lifting
 * here is renaming:
 *   - Variable schema: `{ name, defaultValue }` → `{ key, value, scope, type, label }`
 *   - Trigger types:   `message`/`keywords`/`time`/`email`/`social_event`/...
 *                       → `message_received`/`keyword_match`/`scheduled`/...
 *   - Node subTypes:   kebab-case (`send-text`) → snake_case unified subTypes
 *                       (`send_whatsapp_text`)
 *
 * Provenance lives in `unified_workflows.migrationMetadata`, so the same unique
 * sparse index that backs the CRM migrator also guarantees idempotency for the
 * WhatsApp migrator. Re-running updates; revert deletes.
 *
 * See `temp/audit/workflow-node-matrix.md` for the full subType coverage map.
 * Unknown / un-migrated subTypes are preserved as `set_variable` placeholders
 * and surfaced as warnings — never silently dropped.
 */

import { Types } from 'mongoose';
import {
  WhatsAppWorkflow,
  IWhatsAppWorkflow,
  IWorkflowNode as ILegacyWaNode,
  IWorkflowEdge as ILegacyWaEdge,
  IWorkflowVariable as ILegacyWaVariable,
  IWorkflowTrigger as ILegacyWaTrigger,
} from '../../db/models/whatsapp-workflow.model';
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
  NodeType as UnifiedNodeType,
} from '../../db/models/unified-workflow.model';
import { connectMongoose } from '../../mongodb';

export const WHATSAPP_MIGRATOR_VERSION = 1;

// ---------------------------------------------------------------------------
// Trigger conversion
// ---------------------------------------------------------------------------

const TRIGGER_TYPE_MAP: Record<ILegacyWaTrigger['type'], string> = {
  message: 'message_received',
  keywords: 'keyword_match',
  keyword: 'keyword_monitor',
  time: 'scheduled',
  email: 'email_received',
  social_event: 'social_event',
  webhook: 'webhook',
  telegram: 'telegram_message',
};

function convertTrigger(legacy: ILegacyWaTrigger): IWorkflowTrigger {
  const remappedType = TRIGGER_TYPE_MAP[legacy.type] ?? 'manual';
  return {
    type: remappedType as IWorkflowTrigger['type'],
    config: legacy.config as IWorkflowTrigger['config'],
  };
}

// ---------------------------------------------------------------------------
// Variable conversion
// ---------------------------------------------------------------------------

const VARIABLE_TYPE_MAP: Record<ILegacyWaVariable['type'], VariableType> = {
  string: VariableType.STRING,
  number: VariableType.NUMBER,
  boolean: VariableType.BOOLEAN,
  object: VariableType.OBJECT,
  array: VariableType.ARRAY,
};

function convertVariable(legacy: ILegacyWaVariable): IWorkflowVariable {
  return {
    key: legacy.name,
    label: legacy.name,
    type: VARIABLE_TYPE_MAP[legacy.type] ?? VariableType.ANY,
    scope: VariableScope.WORKFLOW,
    value: legacy.defaultValue,
    description: legacy.description,
  };
}

// ---------------------------------------------------------------------------
// Node subType conversion
//
// The legacy palette mixes node `type` (trigger/message/logic/ai/data/api)
// with kebab-case subTypes. We remap to the unified executionCategory + snake-
// case subType. Anything we don't recognise becomes a `set_variable`
// placeholder so it round-trips without execution-time crashes.
// ---------------------------------------------------------------------------

interface NodeMapping {
  /** Unified executionCategory — feeds into `node.type` for the engine. */
  unifiedType: UnifiedNodeType;
  unifiedSubType: string;
  /** True if the unified processor for this node isn't implemented yet. */
  processorMissing?: boolean;
}

const NODE_MAP: Record<string, Record<string, NodeMapping>> = {
  trigger: {
    'on-message': { unifiedType: 'trigger', unifiedSubType: 'message_received' },
    keywords: { unifiedType: 'trigger', unifiedSubType: 'keyword_match' },
    time: { unifiedType: 'trigger', unifiedSubType: 'scheduled' },
  },
  message: {
    'send-text': { unifiedType: 'action', unifiedSubType: 'send_whatsapp_text' },
    'send-image': { unifiedType: 'action', unifiedSubType: 'send_whatsapp_image' },
    'send-pdf': { unifiedType: 'action', unifiedSubType: 'send_whatsapp_pdf', processorMissing: true },
    'send-video': { unifiedType: 'action', unifiedSubType: 'send_whatsapp_video', processorMissing: true },
    'send-template': { unifiedType: 'action', unifiedSubType: 'send_whatsapp_template' },
    'send-buttons': { unifiedType: 'action', unifiedSubType: 'send_whatsapp_buttons', processorMissing: true },
    'send-list': { unifiedType: 'action', unifiedSubType: 'send_whatsapp_list', processorMissing: true },
  },
  logic: {
    branch: { unifiedType: 'logic', unifiedSubType: 'branch' },
    counter: { unifiedType: 'data', unifiedSubType: 'counter', processorMissing: true },
    delay: { unifiedType: 'control', unifiedSubType: 'delay' },
    end: { unifiedType: 'control', unifiedSubType: 'end' },
  },
  ai: {
    agentic: { unifiedType: 'ai', unifiedSubType: 'agentic' },
  },
  data: {
    variables: { unifiedType: 'data', unifiedSubType: 'set_variable' },
    'knowledge-base': { unifiedType: 'data', unifiedSubType: 'query_knowledge_base', processorMissing: true },
    // bot-config has no direct unified equivalent — fold into a variable set
    'bot-config': { unifiedType: 'data', unifiedSubType: 'set_variable' },
  },
  api: {
    'http-request': { unifiedType: 'integration', unifiedSubType: 'http_request' },
    'assign-agent': { unifiedType: 'action', unifiedSubType: 'assign_to_agent', processorMissing: true },
    'assign-group': { unifiedType: 'action', unifiedSubType: 'assign_to_group', processorMissing: true },
  },
};

function mapLegacyNode(
  legacy: ILegacyWaNode,
  warnings: string[]
): NodeMapping {
  const typeBucket = NODE_MAP[legacy.type];
  if (!typeBucket) {
    warnings.push(`Unknown legacy node type "${legacy.type}" — preserved as set_variable.`);
    return { unifiedType: 'data', unifiedSubType: 'set_variable', processorMissing: false };
  }
  const mapping = typeBucket[legacy.subType];
  if (!mapping) {
    warnings.push(
      `Unknown legacy node subType "${legacy.type}/${legacy.subType}" — preserved as set_variable.`
    );
    return { unifiedType: 'data', unifiedSubType: 'set_variable', processorMissing: false };
  }
  if (mapping.processorMissing) {
    warnings.push(
      `Migrated "${legacy.type}/${legacy.subType}" → "${mapping.unifiedSubType}" but processor is not yet implemented (B2-1.5).`
    );
  }
  return mapping;
}

function convertNode(
  legacy: ILegacyWaNode,
  warnings: string[]
): IWorkflowNode {
  const mapping = mapLegacyNode(legacy, warnings);
  const legacyData = legacy.data ?? {};
  // Surface bot-config payload onto the variable name so the data is preserved.
  let normalizedConfig = (legacyData.config ?? legacyData) as Record<string, unknown>;
  if (legacy.type === 'data' && legacy.subType === 'bot-config') {
    normalizedConfig = {
      variable: '_legacy_bot_config',
      value: legacyData.config ?? legacyData,
    };
  }
  return {
    id: legacy.id,
    type: mapping.unifiedType,
    subType: mapping.unifiedSubType,
    position: legacy.position,
    data: {
      label: typeof legacyData.label === 'string' ? legacyData.label : `${legacy.type}/${legacy.subType}`,
      config: normalizedConfig,
    },
  };
}

function convertEdge(legacy: ILegacyWaEdge): IWorkflowEdge {
  return {
    id: legacy.id,
    source: legacy.source,
    target: legacy.target,
    sourceHandle: legacy.sourceHandle,
    targetHandle: legacy.targetHandle,
    label: legacy.label,
  };
}

// ---------------------------------------------------------------------------
// Pure converter
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<IWhatsAppWorkflow['status'], WorkflowStatus> = {
  draft: WorkflowStatus.DRAFT,
  active: WorkflowStatus.ACTIVE,
  paused: WorkflowStatus.PAUSED,
  archived: WorkflowStatus.ARCHIVED,
};

export interface ConversionResult {
  workflow: Partial<IUnifiedWorkflow>;
  warnings: string[];
}

export function convertWhatsAppWorkflow(legacy: IWhatsAppWorkflow): ConversionResult {
  const warnings: string[] = [];

  const nodes = (legacy.nodes ?? []).map(n => convertNode(n, warnings));
  const edges = (legacy.edges ?? []).map(convertEdge);
  const variables = (legacy.variables ?? []).map(convertVariable);

  if (!legacy.userId) {
    warnings.push(
      `WhatsApp workflow ${legacy._id} has no organizationId. Falling back to userId-derived ObjectId; ` +
      'admin must reconcile after migration.'
    );
  }

  const workflow: Partial<IUnifiedWorkflow> = {
    name: legacy.name,
    description: legacy.description ?? `Migrated from whatsapp_workflows ${legacy._id}`,
    type: WorkflowType.WHATSAPP,
    status: STATUS_MAP[legacy.status] ?? WorkflowStatus.DRAFT,
    // organizationId is required by the model. If absent on the legacy doc, the
    // migrator best-effort uses userId; an admin must reconcile later.
    createdById: legacy.userId,
    trigger: convertTrigger(legacy.trigger),
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
    runOnce: false,
    timeout: 300,
    enableParallel: true,
    enableLoops: true,
    executionCount: legacy.executionCount ?? 0,
    successCount: 0,
    failureCount: 0,
    lastExecutedAt: legacy.lastExecutedAt,
    isTemplate: false,
    version: legacy.version ?? 1,
    migrationMetadata: {
      sourceSystem: 'whatsapp_workflow',
      sourceId: legacy._id as Types.ObjectId,
      migratedAt: new Date(),
      migratorVersion: WHATSAPP_MIGRATOR_VERSION,
    },
  };

  return { workflow, warnings };
}

// ---------------------------------------------------------------------------
// Bulk migration / revert (same shape as the CRM migrator)
// ---------------------------------------------------------------------------

export interface MigrationOptions {
  dryRun: boolean;
  userId?: Types.ObjectId | string;
}

export interface MigrationReport {
  dryRun: boolean;
  totalSourceDocs: number;
  alreadyMigrated: number;
  created: number;
  updated: number;
  warnings: Array<{ whatsappWorkflowId: string; warnings: string[] }>;
  errors: Array<{ whatsappWorkflowId: string; error: string }>;
}

export async function migrateWhatsAppWorkflows(
  options: MigrationOptions
): Promise<MigrationReport> {
  await connectMongoose();

  const filter: Record<string, unknown> = {};
  if (options.userId) filter.userId = new Types.ObjectId(String(options.userId));
  const sourceDocs = await WhatsAppWorkflow.find(filter).lean<IWhatsAppWorkflow[]>().exec();

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
      const { workflow, warnings } = convertWhatsAppWorkflow(sourceDoc);
      if (warnings.length > 0) {
        report.warnings.push({
          whatsappWorkflowId: String(sourceDoc._id),
          warnings,
        });
      }

      const existing = await UnifiedWorkflow.findOne({
        'migrationMetadata.sourceSystem': 'whatsapp_workflow',
        'migrationMetadata.sourceId': sourceDoc._id,
      });
      if (existing) report.alreadyMigrated += 1;

      if (!options.dryRun) {
        if (existing) {
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
        whatsappWorkflowId: String(sourceDoc._id),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}

export interface RevertOptions {
}

export interface RevertReport {
  deleted: number;
}

export async function revertWhatsAppMigration(
  options: RevertOptions = {}
): Promise<RevertReport> {
  await connectMongoose();
  const filter: Record<string, unknown> = {
    'migrationMetadata.sourceSystem': 'whatsapp_workflow',
  };
  const result = await UnifiedWorkflow.deleteMany(filter);
  return { deleted: result.deletedCount ?? 0 };
}
