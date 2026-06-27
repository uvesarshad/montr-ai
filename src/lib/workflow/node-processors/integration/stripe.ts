/**
 * Stripe integration — REST API (import-only / reads).
 *
 * Auth: secret/restricted API key (Authorization: Bearer), resolved via
 * resolveProcessorCredentials. NO write actions (import-only stance — see
 * docs/modules/integrations.md → Write-back policy).
 *
 * Actions:
 *   get_customer            — find a customer by email (GET /customers?email=)
 *   list_recent_payments    — recent charges (GET /charges?limit=)
 *   get_subscription_status — a customer's subscription status by email
 *
 * Config:
 *   credentialId?: string   — workflow credential vault key { apiKey }
 *   connectionId?: string   — explicit IntegrationConnection id
 *   brandId?: string        — brand-scoped connection lookup
 *   action: string          — one of the actions above (default 'get_customer')
 *   email?: string          — for get_customer / get_subscription_status
 *   limit?: number          — for list_recent_payments (default 10)
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { StripeService } from '@/lib/services/stripe.service';

type Action = 'get_customer' | 'list_recent_payments' | 'get_subscription_status';

const VALID_ACTIONS: readonly Action[] = [
  'get_customer',
  'list_recent_payments',
  'get_subscription_status',
];

export class StripeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;

    const { credentials } = await resolveProcessorCredentials({
      provider: 'stripe',
      config,
      workflowCredentials: context.credentials,
    });

    const apiKey = String(credentials.apiKey || '').trim();
    if (!apiKey) throw new Error('Stripe: API key is required');

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'get_customer';

    const email = String(config.email || '').trim();
    const limit = typeof config.limit === 'number' ? config.limit : Number(config.limit) || 10;
    const service = new StripeService(apiKey);

    switch (action) {
      case 'get_customer': {
        if (!email) throw new Error('Stripe: "email" is required for get_customer');
        const customer = await service.getCustomerByEmail(email);
        return { success: true, action, customer };
      }
      case 'list_recent_payments': {
        const payments = await service.listRecentPayments(limit);
        return { success: true, action, payments, count: payments.length };
      }
      case 'get_subscription_status': {
        if (!email) throw new Error('Stripe: "email" is required for get_subscription_status');
        const result = await service.getSubscriptionStatusByEmail(email);
        return { success: true, action, ...result };
      }
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'get_customer';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    const needsEmail = action === 'get_customer' || action === 'get_subscription_status';
    if (needsEmail && !config.email) errors.push(`${action} requires an email`);
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
