/**
 * Workflow node: form-input (Twenty-style interactive `form` action).
 *
 * Pauses the run and asks a human to fill out a form. Modeled directly on
 * voice's `wait-for-call-response` processor — same pause/resume primitive:
 *
 *   First entry:
 *     1. Create a WorkflowFormRequest (status = 'pending') assigned to a user.
 *     2. Notify the assignee in-app.
 *     3. Throw `ExecutionPausedForEvent({ kind: 'form_submitted', key: <formRequestId> })`
 *        so the engine parks the run PAUSED.
 *
 *   Resume (after `POST /workflow-forms/[id]/submit` calls
 *   `resumePausedExecutionsForEvent`): the event-resumer pre-binds the submit
 *   payload onto `context.eventResume.<nodeId>`. This processor reads it and
 *   exposes `{ submitted, values, formRequestId }` as the node output so
 *   downstream nodes can reference `{{$<nodeId>.values.<key>}}`.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { ExecutionPausedForEvent } from '../../execution-pause-signals';
import type { IFormField, FormFieldType } from '@/lib/db/models/workflow-form-request.model';

const VALID_FIELD_TYPES: FormFieldType[] = ['text', 'textarea', 'number', 'select', 'checkbox', 'date'];

interface EventResumeShape {
  matched?: boolean;
  timedOut?: boolean;
  timeoutSec?: number;
  payload?: Record<string, unknown>;
  eventKind?: string;
  eventKey?: string;
  receivedAt?: Date | string;
}

interface FormNodeOutput {
  submitted: boolean;
  values: Record<string, unknown>;
  formRequestId?: string;
  timedOut?: boolean;
}

/** Coerce a config value that may be a JSON string or already an array into IFormField[]. */
function parseFields(raw: unknown): IFormField[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      throw new Error('form-input: config.fields is not valid JSON');
    }
  }
  if (!Array.isArray(arr)) {
    throw new Error('form-input: config.fields must be an array');
  }
  const fields: IFormField[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const key = typeof f.key === 'string' ? f.key.trim() : '';
    const label = typeof f.label === 'string' ? f.label.trim() : '';
    const type = typeof f.type === 'string' ? (f.type as FormFieldType) : 'text';
    if (!key || !label) continue;
    fields.push({
      key,
      label,
      type: VALID_FIELD_TYPES.includes(type) ? type : 'text',
      options: Array.isArray(f.options) ? f.options.map(String) : undefined,
      required: f.required === true,
      placeholder: typeof f.placeholder === 'string' ? f.placeholder : undefined,
    });
  }
  if (fields.length === 0) {
    throw new Error('form-input: at least one valid field (key + label) is required');
  }
  return fields;
}

export class FormInputProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { node, config, execution, workflow } = context;

    // ---- Resume path -------------------------------------------------------
    const eventResumeBag = (execution.context as { eventResume?: Record<string, EventResumeShape> })
      ?.eventResume;
    const bound = eventResumeBag?.[node.id];
    if (bound) {
      const payload = (bound.payload ?? {}) as Record<string, unknown>;
      const result: FormNodeOutput = {
        submitted: bound.matched === true && bound.timedOut !== true,
        values:
          payload.values && typeof payload.values === 'object'
            ? (payload.values as Record<string, unknown>)
            : {},
        formRequestId: typeof payload.formRequestId === 'string' ? payload.formRequestId : undefined,
        timedOut: bound.timedOut === true,
      };
      return result as unknown as Record<string, unknown>;
    }

    // ---- First entry: create the form request, notify, pause ---------------
    const title =
      typeof config.title === 'string' && config.title.trim() ? config.title.trim() : 'Workflow needs your input';
    const description = typeof config.description === 'string' ? config.description.trim() : undefined;
    const fields = parseFields(config.fields);
    // Assignee resolution: specific user, else workflow owner.
    const assignTo = typeof config.assignTo === 'string' ? config.assignTo : 'workflow_owner';
    let assigneeId: string | undefined;
    if (assignTo === 'specific' && typeof config.assigneeId === 'string' && config.assigneeId.trim()) {
      assigneeId = config.assigneeId.trim();
    } else {
      assigneeId = workflow.createdById?.toString() ?? execution.userId?.toString();
    }
    if (!assigneeId) {
      throw new Error('form-input: could not resolve an assignee (no assigneeId / workflow owner)');
    }

    const executionId = execution._id?.toString();
    if (!executionId) {
      throw new Error('form-input: execution has no _id');
    }

    const nextNodeIds = (workflow.edges ?? [])
      .filter((e) => e.source === node.id)
      .map((e) => e.target);

    const { workflowFormRequestRepository } = await import(
      '@/lib/db/repository/workflow-form-request.repository'
    );
    const formRequest = await workflowFormRequestRepository.create({
      workflowId: workflow._id?.toString() ?? String(execution.workflowId ?? ''),
      executionId,
      nodeId: node.id,
      title,
      description,
      fields,
      assigneeId,
    });
    const formRequestId = String(formRequest._id);

    // Notify the assignee (best-effort — never block the pause on it).
    try {
      const { notifyUser } = await import('@/lib/notifications/notification-service');
      await notifyUser(assigneeId, {
        type: 'system.info',
        title: `${workflow.name || 'A workflow'} needs your input`,
        body: title,
        requiresAction: true,
        source: { module: 'automation', entityType: 'form_request', entityId: formRequestId },
        actionUrl: `/workflows/forms?form=${formRequestId}`,
        actionLabel: 'Open form',
        data: { formRequestId, workflowId: workflow._id?.toString(), executionId },
        dedupeKey: `form-request:${formRequestId}`,
      });
    } catch (err) {
      console.error('[form-input] notification dispatch failed:', err);
    }

    throw new ExecutionPausedForEvent(node.id, nextNodeIds, {
      kind: 'form_submitted',
      key: formRequestId,
    });
  }
}
