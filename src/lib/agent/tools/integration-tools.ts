/**
 * Integrations Hub agent tools (Phase 3, 2026-06-05 — G11, v1).
 *
 * v1 exposes connection AWARENESS: the agent can see which business tools are
 * connected (Mailchimp, HubSpot, Shopify, Notion, …) and reason about them —
 * e.g. "Shopify is connected, suggest a workflow that imports orders" — and
 * point users to the right workflow nodes (integration_* node processors)
 * via triggerWorkflow. Direct provider-action invocation (run_integration_action)
 * is deliberately deferred until per-provider action allowlists are designed;
 * credentials never reach the agent (resolution stays server-side in
 * src/lib/integrations/server/processor-credentials.ts).
 */

import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import { INTEGRATION_PROVIDERS } from '@/lib/integrations/registry';
import IntegrationConnection from '@/lib/db/models/integration-connection.model';
import { dbConnect } from '@/lib/db/connect';

export const listIntegrationsTool = {
    name: 'list_integrations',
    description: 'List the third-party business tools connected to this organization/brand (Mailchimp, HubSpot, Shopify, Notion, WordPress, …) with status and capabilities. Use this to ground recommendations — e.g. suggest workflows that use a connected tool\'s integration nodes.',
    parameters: z.object({}),
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'List connected integrations for this organization.',
        parameters: z.object({}),
        execute: async () => {
            try {
                await dbConnect();
                const connections = await IntegrationConnection.find({
}).select('provider brandId status externalAccountName lastUsedAt dataDirection').lean().exec();

                const byProvider = new Map(INTEGRATION_PROVIDERS.map((p) => [p.id, p]));

                return {
                    success: true,
                    total: connections.length,
                    connections: connections.map((c) => {
                        const def = byProvider.get(c.provider);
                        return {
                            provider: c.provider,
                            name: def?.name ?? c.provider,
                            category: def?.category,
                            dataDirection: def?.dataDirection,
                            status: c.status,
                            account: c.externalAccountName,
                            brandScoped: !!c.brandId,
                            // Brand-pinned connections on other brands are visible but flagged.
                            availableToCurrentBrand: !c.brandId || !context.brandId || String(c.brandId) === context.brandId,
                        };
                    }),
                    availableProviders: INTEGRATION_PROVIDERS
                        .filter((p) => p.status === 'available')
                        .map((p) => ({ id: p.id, name: p.name, category: p.category })),
                    note: 'Integration actions run through workflows (integration_* nodes via triggerWorkflow) — credentials are resolved server-side, never by the agent.',
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

toolRegistry.register(listIntegrationsTool);
