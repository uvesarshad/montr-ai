// OSS single-tenant override of src/lib/crm/workflow-engine.ts — CP-2 hand-patch; org-stripped.
/**
 * CRM Workflow Engine
 *
 * Evaluates workflow triggers, conditions, and executes actions.
 * Supports 11 trigger types and 13 action types.
 */

import { workflowRepository } from '@/lib/db/repository/crm/workflow.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import { ICrmWorkflow, IWorkflowCondition, IWorkflowAction } from '@/lib/db/models/crm/workflow.model';
import { CrmEventData } from './events';

/**
 * Evaluate if a trigger's conditions are met
 */
export function evaluateTrigger(
  workflow: ICrmWorkflow,
  eventData: CrmEventData
): boolean {
  const { trigger } = workflow;
  const { config } = trigger;

  // Check if entity type matches
  if (trigger.entityType !== eventData.entityType) {
    return false;
  }

  // For field_changed trigger, check specific field
  if (trigger.type === 'field_changed' && config.field) {
    if (!eventData.changes || !eventData.changes[config.field]) {
      return false;
    }

    // Optionally check from/to values
    if (config.fromValue !== undefined) {
      const actualFrom = eventData.changes[config.field].from;
      if (actualFrom !== config.fromValue) {
        return false;
      }
    }

    if (config.toValue !== undefined) {
      const actualTo = eventData.changes[config.field].to;
      if (actualTo !== config.toValue) {
        return false;
      }
    }
  }

  // For stage_changed trigger, check stage
  if (trigger.type === 'stage_changed' && config.stageId) {
    if (eventData.entity.stageId?.toString() !== config.stageId.toString()) {
      return false;
    }
  }

  // For tag events, check tag
  if ((trigger.type === 'tag_added' || trigger.type === 'tag_removed') && config.tagId) {
    // Check if the tag is in the entity's tags
    const entityTags = (eventData.entity.tags as unknown[]) || [];
    const hasTag = entityTags.some((tag: unknown) => String(tag) === config.tagId?.toString());

    if (trigger.type === 'tag_added' && !hasTag) {
      return false;
    }
    if (trigger.type === 'tag_removed' && hasTag) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate workflow conditions (filters)
 */
export function evaluateConditions(
  conditions: IWorkflowCondition[],
  entity: Record<string, unknown>
): boolean {
  if (!conditions || conditions.length === 0) {
    return true; // No conditions means always pass
  }

  let result = true;
  let currentConjunction: 'and' | 'or' = 'and';

  for (const condition of conditions) {
    const fieldValue = getNestedValue(entity, condition.field);
    const conditionResult = evaluateCondition(
      fieldValue,
      condition.operator,
      condition.value
    );

    // Apply conjunction logic
    if (currentConjunction === 'and') {
      result = result && conditionResult;
    } else {
      result = result || conditionResult;
    }

    currentConjunction = condition.conjunction || 'and';
  }

  return result;
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(
  fieldValue: unknown,
  operator: string,
  conditionValue: unknown
): boolean {
  switch (operator) {
    case 'equals':
      return fieldValue === conditionValue;

    case 'not_equals':
      return fieldValue !== conditionValue;

    case 'contains':
      if (typeof fieldValue === 'string') {
        return fieldValue.toLowerCase().includes(typeof conditionValue === 'string' ? conditionValue.toLowerCase() : String(conditionValue));
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(conditionValue);
      }
      return false;

    case 'not_contains':
      if (typeof fieldValue === 'string') {
        return !fieldValue.toLowerCase().includes(typeof conditionValue === 'string' ? conditionValue.toLowerCase() : String(conditionValue));
      }
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(conditionValue);
      }
      return true;

    case 'greater_than':
      return Number(fieldValue) > Number(conditionValue);

    case 'less_than':
      return Number(fieldValue) < Number(conditionValue);

    case 'is_empty':
      return (
        fieldValue === null ||
        fieldValue === undefined ||
        fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0)
      );

    case 'is_not_empty':
      return !(
        fieldValue === null ||
        fieldValue === undefined ||
        fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0)
      );

    case 'in_list':
      if (!Array.isArray(conditionValue)) {
        return false;
      }
      return conditionValue.includes(fieldValue);

    case 'not_in_list':
      if (!Array.isArray(conditionValue)) {
        return true;
      }
      return !conditionValue.includes(fieldValue);

    default:
      console.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let value: unknown = obj;

  for (const key of keys) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[key];
  }

  return value;
}

/**
 * Execute workflow actions
 */
export async function executeActions(
  actions: IWorkflowAction[],
  eventData: CrmEventData,
  workflow: ICrmWorkflow
): Promise<void> {
  for (const action of actions) {
    try {
      await executeAction(action, eventData, workflow);
    } catch (error) {
      console.error(
        `Error executing action ${action.type} in workflow ${workflow._id}:`,
        error
      );
      // Continue with other actions even if one fails
    }
  }
}

/**
 * Execute a single action
 */
async function executeAction(
  action: IWorkflowAction,
  eventData: CrmEventData,
  workflow: ICrmWorkflow
): Promise<void> {
  const { type, config } = action;
  const configAsUnknown = config as Record<string, unknown>;
  const { entityType, entityId, entity } = eventData;

  switch (type) {
    case 'update_field':
      await executeUpdateField(entityType, entityId, configAsUnknown);
      break;

    case 'add_tag':
      await executeAddTag(entityType, entityId, configAsUnknown);
      break;

    case 'remove_tag':
      await executeRemoveTag(entityType, entityId, configAsUnknown);
      break;

    case 'assign_owner':
      await executeAssignOwner(entityType, entityId, configAsUnknown);
      break;

    case 'create_task':
      await executeCreateTask(entity, configAsUnknown, workflow.createdById.toString());
      break;

    case 'create_activity':
      await executeCreateActivity(entity, configAsUnknown, workflow.createdById.toString());
      break;

    case 'send_email':
      await executeSendEmail(entity, configAsUnknown);
      break;
    // @ts-expect-error
    case 'send_marketing_email':
      await executeSendMarketingEmail(entity, configAsUnknown, workflow.createdById.toString());
      break;
    case 'send_webhook':
      await executeSendWebhook(entity, configAsUnknown);
      break;

    case 'create_deal':
      await executeCreateDeal(entity, configAsUnknown, workflow.createdById.toString());
      break;

    case 'move_stage':
      await executeMoveStage(entityId, configAsUnknown);
      break;

    case 'wait':
      // Wait action is handled differently (requires job queue)
      console.log('Wait action not yet implemented - requires job queue');
      break;

    case 'condition':
      await executeConditionalBranch(action, eventData, workflow);
      break;

    default:
      console.warn(`Unknown action type: ${type}`);
  }
}

/**
 * Update a field on the entity
 */
async function executeUpdateField(
  entityType: string,
  entityId: string,
  config: Record<string, unknown>
): Promise<void> {
  if (!config.field || config.value === undefined) {
    return;
  }

  const updateData: Record<string, unknown> = { [config.field as string]: config.value };

  switch (entityType) {
    case 'contact':
      await contactRepository.update(entityId, updateData);
      break;
    case 'company':
      await companyRepository.update(entityId, updateData);
      break;
    case 'deal':
      await dealRepository.update(entityId, updateData);
      break;
  }
}

/**
 * Add a tag to the entity
 */
async function executeAddTag(
  entityType: string,
  entityId: string,
  config: Record<string, unknown>
): Promise<void> {
  if (!config.tagId) {
    return;
  }

  // Get current entity
  let entity: { tags?: unknown[] } | null | undefined;
  switch (entityType) {
    case 'contact':
      entity = await contactRepository.findById(entityId);
      break;
    case 'company':
      entity = await companyRepository.findById(entityId);
      break;
    case 'deal':
      entity = await dealRepository.findById(entityId);
      break;
  }

  if (!entity) return;

  // Add tag if not already present
  const existingTags: unknown[] = (entity as { tags?: unknown[] }).tags || [];
  const tagId = String(config.tagId);

  if (!existingTags.some((t: unknown) => String(t) === tagId)) {
    const updatedTags = [...existingTags.map(String), tagId];

    switch (entityType) {
      case 'contact':
        await contactRepository.update(entityId, { tags: updatedTags });
        break;
      case 'company':
        await companyRepository.update(entityId, { tags: updatedTags });
        break;
      case 'deal':
        await dealRepository.update(entityId, { tags: updatedTags });
        break;
    }
  }
}

/**
 * Remove a tag from the entity
 */
async function executeRemoveTag(
  entityType: string,
  entityId: string,
  config: Record<string, unknown>
): Promise<void> {
  if (!config.tagId) {
    return;
  }

  // Get current entity
  let entity: { tags?: unknown[] } | null | undefined;
  switch (entityType) {
    case 'contact':
      entity = await contactRepository.findById(entityId);
      break;
    case 'company':
      entity = await companyRepository.findById(entityId);
      break;
    case 'deal':
      entity = await dealRepository.findById(entityId);
      break;
  }

  if (!entity) return;

  // Remove tag
  const filteredTags = ((entity as { tags?: unknown[] }).tags || [])
    .filter((t: unknown) => String(t) !== String(config.tagId))
    .map(String);

  switch (entityType) {
    case 'contact':
      await contactRepository.update(entityId, { tags: filteredTags });
      break;
    case 'company':
      await companyRepository.update(entityId, { tags: filteredTags });
      break;
    case 'deal':
      await dealRepository.update(entityId, { tags: filteredTags });
      break;
  }
}

/**
 * Assign owner to entity
 */
async function executeAssignOwner(
  entityType: string,
  entityId: string,
  config: Record<string, unknown>
): Promise<void> {
  if (!config.ownerId) {
    return;
  }

  const updateData: Record<string, unknown> = { ownerId: config.ownerId };

  switch (entityType) {
    case 'contact':
      await contactRepository.update(entityId, updateData);
      break;
    case 'company':
      await companyRepository.update(entityId, updateData);
      break;
    case 'deal':
      await dealRepository.update(entityId, updateData);
      break;
  }
}

/**
 * Create a task activity
 */
async function executeCreateTask(
  entity: Record<string, unknown>,
  config: Record<string, unknown>,
  createdById: string
): Promise<void> {
  if (!config.subject) {
    return;
  }

  const dueDate = config.dueInDays
    ? new Date(Date.now() + Number(config.dueInDays) * 24 * 60 * 60 * 1000)
    : undefined;

  let assignedTo: unknown = entity.ownerId;
  if (config.assignTo === 'specific' && config.assignToUserId) {
    assignedTo = config.assignToUserId;
  }

  await activityRepository.create({
    type: 'task',
    subject: String(config.subject ?? ''),
    // @ts-expect-error
    description: config.body,
    status: 'pending',
    dueDate,
    assignedTo: assignedTo ? String(assignedTo) : undefined,
    contactId: entity._id ? String(entity._id) : undefined,
    companyId: entity.companyId ? String(entity.companyId) : undefined,
    createdById: assignedTo ? String(assignedTo) : createdById,
  });
}

/**
 * Create an activity (note, call, meeting)
 */
async function executeCreateActivity(
  entity: Record<string, unknown>,
  config: Record<string, unknown>,
  createdById: string
): Promise<void> {
  const activityType = String(config.activityType || 'note');

  await activityRepository.create({
    type: activityType as 'note' | 'task' | 'call' | 'meeting' | 'email' | 'message',
    subject: String(config.subject ?? ''),
    // @ts-expect-error
    description: config.body,
    status: activityType === 'note' ? 'completed' : 'pending',
    contactId: entity._id ? String(entity._id) : undefined,
    companyId: entity.companyId ? String(entity.companyId) : undefined,
    createdById: entity.ownerId ? String(entity.ownerId) : createdById,
  });
}

/**
 * Send email action.
 *
 * Resolves the recipient (config.to overrides the entity email), interpolates
 * `{{field}}` placeholders in subject/body against the entity, and dispatches
 * via the configured SMTP transport. Body can be plain text (`config.body`)
 * or HTML (`config.html`); both are passed when present.
 *
 * Failures are logged and swallowed — workflows have many actions and a
 * single bad email shouldn't abort downstream steps.
 */
async function executeSendEmail(
  entity: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<void> {
  // Lazy import — keeps the engine bundle slim and avoids cold-loading
  // nodemailer for workflows that never send mail.
  const { sendEmail, isEmailConfigured } = await import('@/lib/email');

  if (!isEmailConfigured()) {
    console.warn('[workflow-engine] sendEmail skipped: SMTP not configured');
    return;
  }

  const to: string | undefined =
    (typeof config?.to === 'string' && config.to.trim()) ||
    (typeof entity?.email === 'string' && entity.email.trim()) ||
    undefined;

  if (!to) {
    console.warn('[workflow-engine] sendEmail skipped: no recipient resolved');
    return;
  }

  const subject = replaceVariables(String(config?.subject ?? ''), entity);
  const bodyText = config?.body ? replaceVariables(String(config.body), entity) : undefined;
  const bodyHtml = config?.html ? replaceVariables(String(config.html), entity) : undefined;

  if (!subject || (!bodyText && !bodyHtml)) {
    console.warn('[workflow-engine] sendEmail skipped: missing subject or body');
    return;
  }

  try {
    await sendEmail({
      to,
      subject,
      text: bodyText,
      html: bodyHtml,
      from: typeof config?.from === 'string' && config.from.trim() ? config.from : undefined,
      replyTo: typeof config?.replyTo === 'string' && config.replyTo.trim() ? config.replyTo : undefined,
    });
  } catch (error) {
    console.error('[workflow-engine] sendEmail failed:', error);
  }
}

/**
 * Send webhook from a workflow action.
 *
 * Uses `safeOutboundFetch` so the user-supplied URL is SSRF-validated and
 * DNS-pinned to the validated IP — the same defence the dedicated CRM webhook
 * delivery path uses.
 */
async function executeSendWebhook(
  entity: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<void> {
  if (!config.url) {
    return;
  }

  const { safeOutboundFetch } = await import('@/lib/workflow/ssrf-guard');

  const payload = config.bodyTemplate
    ? (JSON.parse(replaceVariables(String(config.bodyTemplate), entity)) as Record<string, unknown>)
    : entity;

  try {
    const response = await safeOutboundFetch(String(config.url), {
      method: String(config.method || 'POST'),
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers as Record<string, string> | undefined),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }
}

/**
 * Create a deal
 */
async function executeCreateDeal(
  entity: Record<string, unknown>,
  config: Record<string, unknown>,
  createdById: string
): Promise<void> {
  if (!config.pipelineId || !config.stageId) {
    return;
  }

  const dealName = config.name
    ? replaceVariables(String(config.name), entity)
    : `Deal for ${entity.firstName || entity.name}`;

  await dealRepository.create({
    name: dealName,
    contactId: entity._id ? String(entity._id) : undefined,
    companyId: entity.companyId ? String(entity.companyId) : undefined,
    pipelineId: String(config.pipelineId),
    stageId: String(config.stageId),
    ownerId: entity.ownerId ? String(entity.ownerId) : undefined,
    createdById,
  });
}

/**
 * Move deal to different stage
 */
async function executeMoveStage(
  entityId: string,
  config: Record<string, unknown>
): Promise<void> {
  if (!config.stageId) {
    return;
  }

  await dealRepository.update(entityId, {
    stageId: String(config.stageId),
  });
}

/**
 * Execute conditional branch
 */
async function executeConditionalBranch(
  action: IWorkflowAction,
  eventData: CrmEventData,
  workflow: ICrmWorkflow
): Promise<void> {
  const { config } = action;

  if (!config.conditions) {
    return;
  }

  const conditionsMet = evaluateConditions(config.conditions, eventData.entity);

  const actionsToExecute = conditionsMet
    ? (config.thenActions || [])
    : (config.elseActions || []);

  await executeActions(actionsToExecute as IWorkflowAction[], eventData, workflow);
}

/**
 * Replace variables in template strings
 * Supports {{field}} syntax
 */
function replaceVariables(template: string, entity: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
    const value = getNestedValue(entity, path);
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Main entry point: Trigger workflow execution for an event
 */
export async function triggerWorkflows(
  eventType: string,
  entityType: string,
  eventData: CrmEventData
): Promise<void> {
  try {
    // Find active workflows matching this trigger type and entity type
    const workflows = await workflowRepository.findByTrigger(
      eventType,
      entityType
    );

    for (const workflow of workflows) {
      try {
        // Check cooldown
        if (workflow.cooldownMinutes && workflow.lastExecutedAt) {
          const cooldownMs = workflow.cooldownMinutes * 60 * 1000;
          const timeSinceLastExecution = Date.now() - workflow.lastExecutedAt.getTime();
          if (timeSinceLastExecution < cooldownMs) {
            continue; // Skip this workflow
          }
        }

        // Check max executions
        if (workflow.maxExecutions && workflow.executionCount >= workflow.maxExecutions) {
          continue; // Skip this workflow
        }

        // Evaluate trigger conditions
        if (!evaluateTrigger(workflow, eventData)) {
          continue;
        }

        // Evaluate workflow conditions
        if (!evaluateConditions(workflow.conditions, eventData.entity)) {
          continue;
        }

        // Execute actions
        await executeActions(workflow.actions, eventData, workflow);

        // Update execution stats
        await workflowRepository.incrementExecutionCount(workflow._id.toString());

        // If runOnce, deactivate the workflow
        if (workflow.runOnce) {
          await workflowRepository.deactivate(
            workflow._id.toString()
          );
        }
      } catch (error) {
        console.error(`Error executing workflow ${workflow._id}:`, error);
        await workflowRepository.incrementErrorCount(workflow._id.toString());
      }
    }
  } catch (error) {
    console.error('Error triggering workflows:', error);
  }
}

async function executeSendMarketingEmail(
  entity: Record<string, unknown>,
  config: Record<string, unknown>,
  createdById: string
): Promise<void> {
  // Dynamically import to avoid circular dependency issues
  const { ProviderFactory } = await import('@/lib/marketing-email/providers/provider-factory');
  const { templateService } = await import('@/lib/marketing-email/services/template.service');
  const { trackingService } = await import('@/lib/marketing-email/services/tracking.service');
  // We need to fetch models directly
  const MarketingTemplate = (await import('@/lib/db/models/marketing-email/template.model')).default;
  const MarketingProvider = (await import('@/lib/db/models/marketing-email/provider.model')).default;
  const Activity = (await import('@/lib/db/models/crm/activity.model')).default;


  const { marketingTemplateId, marketingProviderId } = config;
  const entityEmail = entity.email as string | undefined;
  const entityId = entity._id as { toString(): string } | undefined;

  if (!entityEmail) {
    console.log('Skipping marketing email: entity has no email');
    return;
  }

  // Get template and provider
  const template = await MarketingTemplate.findById(marketingTemplateId);
  const provider = await MarketingProvider.findById(marketingProviderId);

  if (!template || !provider) {
    console.error('Marketing template or provider not found for workflow action');
    return;
  }

  // Render template with contact data
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { subject, html, text } = templateService.render(template, { contact: entity });

  // Send via provider
  const providerInstance = ProviderFactory.create(provider);

  try {
    const result = await providerInstance.send({
      to: entityEmail,
      subject: subject,
      html: html,
      text: text,
      fromEmail: provider.fromEmail,
      fromName: provider.fromName,
      replyTo: provider.replyToEmail,
      tags: ['workflow-automation'],
      metadata: {
        workflowId: 'workflow-automation',
        contactId: entityId?.toString() ?? '',
        templateId: template._id.toString()
      }
    });

    // Record 'sent' event (single-tenant: the per-owner scope is the creator's id)
    await trackingService.recordEvent(
      createdById,
      result.messageId,
      'sent',
      {
        providerId: provider._id.toString(),
        contactId: entityId?.toString() ?? '',
        email: entityEmail,
      }
    );

    // Log activity in CRM
    // Note: activity model might need updates if strict typing is enforced for 'type'
    await Activity.create({
      type: 'email',
      subject: `Marketing Email Sent: ${subject}`,
      body: `Template: ${template.name}`,
      contactId: entityId,
      createdById, // System action
      performedAt: new Date(),
      // Add minimal required fields to satisfy Activity model if strictly typed in a way that requires these suitable defaults
    });
  } catch (error) {
    console.error('Failed to send marketing email in workflow', error);
    // We don't throw here to avoid failing the whole workflow execution, just log error
  }
}
