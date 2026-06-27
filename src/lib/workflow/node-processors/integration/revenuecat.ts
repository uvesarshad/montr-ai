/**
 * RevenueCat integration — REST API v2 (import-only / reads).
 *
 * Auth: secret API key (Authorization: Bearer), resolved via
 * resolveProcessorCredentials.
 *
 * Actions:
 *   list_projects             — GET /projects
 *   get_customer              — GET /projects/{p}/customers/{c}
 *   get_customer_subscriptions— GET /projects/{p}/customers/{c}/subscriptions
 *   get_customer_purchases    — GET /projects/{p}/customers/{c}/purchases
 *   list_entitlements         — GET /projects/{p}/entitlements
 *
 * Config:
 *   credentialId?: string   — workflow credential vault key { apiKey }
 *   connectionId?: string   — explicit IntegrationConnection id
 *   brandId?: string        — brand-scoped connection lookup
 *   action: string          — one of the actions above (default 'list_projects')
 *   projectId?: string      — project-scoped actions
 *   customerId?: string     — customer-scoped actions
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { RevenuecatService } from '@/lib/services/revenuecat.service';

type Action =
  | 'list_projects'
  | 'get_customer'
  | 'get_customer_subscriptions'
  | 'get_customer_purchases'
  | 'list_entitlements';

const VALID_ACTIONS: readonly Action[] = [
  'list_projects',
  'get_customer',
  'get_customer_subscriptions',
  'get_customer_purchases',
  'list_entitlements',
];

export class RevenuecatProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, connectionId } = await resolveProcessorCredentials({
      provider: 'revenuecat',
      config,
      workflowCredentials: context.credentials,
    });

    const apiKey = String(credentials.apiKey || '').trim();
    if (!apiKey) throw new Error('RevenueCat: API key is required');

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'list_projects';

    const projectId = String(config.projectId || '').trim();
    const customerId = String(config.customerId || '').trim();
    const service = new RevenuecatService(apiKey);

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'revenuecat',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'list_projects': {
        const result = await service.listProjects();
        return { success: true, action, result };
      }
      case 'get_customer': {
        if (!projectId) throw new Error('RevenueCat: "projectId" is required for get_customer');
        if (!customerId) throw new Error('RevenueCat: "customerId" is required for get_customer');
        const result = await service.getCustomer(projectId, customerId);
        return { success: true, action, customer: result };
      }
      case 'get_customer_subscriptions': {
        if (!projectId) {
          throw new Error('RevenueCat: "projectId" is required for get_customer_subscriptions');
        }
        if (!customerId) {
          throw new Error('RevenueCat: "customerId" is required for get_customer_subscriptions');
        }
        const result = await service.listCustomerSubscriptions(projectId, customerId);
        return { success: true, action, result };
      }
      case 'get_customer_purchases': {
        if (!projectId) {
          throw new Error('RevenueCat: "projectId" is required for get_customer_purchases');
        }
        if (!customerId) {
          throw new Error('RevenueCat: "customerId" is required for get_customer_purchases');
        }
        const result = await service.listCustomerPurchases(projectId, customerId);
        return { success: true, action, result };
      }
      case 'list_entitlements': {
        if (!projectId) {
          throw new Error('RevenueCat: "projectId" is required for list_entitlements');
        }
        const result = await service.listEntitlements(projectId);
        return { success: true, action, result };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'list_projects';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    const needsProject =
      action === 'get_customer' ||
      action === 'get_customer_subscriptions' ||
      action === 'get_customer_purchases' ||
      action === 'list_entitlements';
    const needsCustomer =
      action === 'get_customer' ||
      action === 'get_customer_subscriptions' ||
      action === 'get_customer_purchases';
    if (needsProject && !config.projectId) errors.push(`${action} requires a projectId`);
    if (needsCustomer && !config.customerId) errors.push(`${action} requires a customerId`);
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
