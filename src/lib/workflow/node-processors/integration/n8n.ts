/**
 * n8n integration — Public API v1 + production-webhook trigger.
 *
 * Auth: API key (X-N8N-API-KEY header) + user-supplied baseUrl, resolved via
 * resolveProcessorCredentials.
 *
 * SECURITY: the base URL is user-controlled — N8nService routes EVERY request
 * through safeOutboundFetch (SSRF guard).
 *
 * Actions:
 *   list_workflows      — GET /workflows (config.active, config.limit, config.cursor)
 *   get_workflow        — GET /workflows/{id} (config.workflowId)
 *   activate_workflow   — POST /workflows/{id}/activate
 *   deactivate_workflow — POST /workflows/{id}/deactivate
 *   list_executions     — GET /executions (config.workflowId, config.status, …)
 *   get_execution       — GET /executions/{id} (config.executionId)
 *   trigger_webhook     — POST {base}/webhook/{path} (config.webhookPath, config.payload)
 *
 * Config:
 *   credentialId?: string  — workflow credential vault key { baseUrl, apiKey }
 *   connectionId?: string  — explicit IntegrationConnection id
 *   brandId?: string       — brand-scoped connection lookup
 *   action: string         — one of the actions above (default 'list_workflows')
 *   workflowId?: string
 *   executionId?: string
 *   active?: boolean
 *   status?: string        — list_executions filter
 *   limit?: number (cap 100)
 *   cursor?: string
 *   webhookPath?: string   — trigger_webhook
 *   webhookMethod?: string — trigger_webhook (default POST)
 *   payload?: unknown      — trigger_webhook body
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { N8nService } from '@/lib/services/n8n.service';

type Action =
  | 'list_workflows'
  | 'get_workflow'
  | 'activate_workflow'
  | 'deactivate_workflow'
  | 'list_executions'
  | 'get_execution'
  | 'trigger_webhook';

const VALID_ACTIONS: readonly Action[] = [
  'list_workflows',
  'get_workflow',
  'activate_workflow',
  'deactivate_workflow',
  'list_executions',
  'get_execution',
  'trigger_webhook',
];

type WebhookMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const WEBHOOK_METHODS: readonly WebhookMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export class N8nProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, connectionId } = await resolveProcessorCredentials({
      provider: 'n8n',
      config,
      workflowCredentials: context.credentials,
    });

    const baseUrl = String(credentials.baseUrl || '').trim();
    const apiKey = String(credentials.apiKey || '').trim();
    if (!baseUrl) throw new Error('n8n: instance base URL is required');
    if (!apiKey) throw new Error('n8n: API key is required');

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'list_workflows';

    const service = new N8nService(baseUrl, apiKey);

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'n8n',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'list_workflows': {
        const result = await service.listWorkflows({
          active:
            typeof config.active === 'boolean' ? config.active : undefined,
          limit: Number(config.limit) || undefined,
          cursor: config.cursor as string | undefined,
        });
        const data = (result.data as unknown[] | undefined) || [];
        return {
          success: true,
          action,
          count: data.length,
          workflows: data,
          nextCursor: result.nextCursor ?? null,
        };
      }
      case 'get_workflow': {
        const id = String(config.workflowId || '').trim();
        if (!id) throw new Error('n8n: "workflowId" is required for get_workflow');
        return { success: true, action, workflow: await service.getWorkflow(id) };
      }
      case 'activate_workflow': {
        const id = String(config.workflowId || '').trim();
        if (!id) throw new Error('n8n: "workflowId" is required for activate_workflow');
        return { success: true, action, workflow: await service.activateWorkflow(id) };
      }
      case 'deactivate_workflow': {
        const id = String(config.workflowId || '').trim();
        if (!id) throw new Error('n8n: "workflowId" is required for deactivate_workflow');
        return { success: true, action, workflow: await service.deactivateWorkflow(id) };
      }
      case 'list_executions': {
        const status = config.status as string | undefined;
        const result = await service.listExecutions({
          workflowId: (config.workflowId as string | undefined) || undefined,
          status:
            status === 'error' || status === 'success' || status === 'waiting'
              ? status
              : undefined,
          limit: Number(config.limit) || undefined,
          cursor: config.cursor as string | undefined,
        });
        const data = (result.data as unknown[] | undefined) || [];
        return {
          success: true,
          action,
          count: data.length,
          executions: data,
          nextCursor: result.nextCursor ?? null,
        };
      }
      case 'get_execution': {
        const id = String(config.executionId || '').trim();
        if (!id) throw new Error('n8n: "executionId" is required for get_execution');
        return { success: true, action, execution: await service.getExecution(id) };
      }
      case 'trigger_webhook': {
        const webhookPath = String(config.webhookPath || '').trim();
        if (!webhookPath) {
          throw new Error('n8n: "webhookPath" is required for trigger_webhook');
        }
        const rawMethod = String(config.webhookMethod || 'POST').toUpperCase();
        const method: WebhookMethod = WEBHOOK_METHODS.includes(rawMethod as WebhookMethod)
          ? (rawMethod as WebhookMethod)
          : 'POST';
        const result = await service.triggerWebhook(webhookPath, method, config.payload);
        return { success: true, action, result };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'list_workflows';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    const needsWorkflowId =
      action === 'get_workflow' ||
      action === 'activate_workflow' ||
      action === 'deactivate_workflow';
    if (needsWorkflowId && !config.workflowId) errors.push(`${action} requires a workflowId`);
    if (action === 'get_execution' && !config.executionId) {
      errors.push('get_execution requires an executionId');
    }
    if (action === 'trigger_webhook' && !config.webhookPath) {
      errors.push('trigger_webhook requires a webhookPath');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
