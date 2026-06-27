/**
 * Shopify integration — Admin GraphQL API (read-only import direction).
 *
 * Credentials are resolved through resolveProcessorCredentials:
 *   1. config.credentialId → workflow credential vault
 *   2. config.connectionId → a specific IntegrationConnection (org-checked)
 *   3. auto-resolve        → brand → org connection
 *
 * The shop domain + apiVersion come from the connection metadata
 * ({ shop, apiVersion }); the access token comes from the credentials blob.
 *
 * Actions:
 *   get_shop          — store info
 *   list_products     — paginated products
 *   get_product       — single product by id (numeric or gid)
 *   search_products   — products filtered by `query`
 *   list_orders       — paginated orders
 *   get_order         — single order by id
 *   list_customers    — paginated customers
 *   search_customers  — customers filtered by `query`
 *
 * Config:
 *   credentialId? / connectionId? / brandId?  — credential resolution
 *   action: string        — one of the above (default 'list_products')
 *   shop? / apiVersion?   — override connection metadata
 *   accessToken?          — override (rarely needed)
 *   id?                   — for get_* actions
 *   first?: number        — page size (cap 50)
 *   after?: string        — pagination cursor
 *   query?: string        — search/filter string
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { ShopifyService } from '@/lib/services/shopify.service';

type Action =
  | 'get_shop'
  | 'list_products'
  | 'get_product'
  | 'search_products'
  | 'list_orders'
  | 'get_order'
  | 'list_customers'
  | 'search_customers';

const VALID_ACTIONS: readonly Action[] = [
  'get_shop',
  'list_products',
  'get_product',
  'search_products',
  'list_orders',
  'get_order',
  'list_customers',
  'search_customers',
];

export class ShopifyProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, metadata, connectionId } = await resolveProcessorCredentials({
      provider: 'shopify',
      config: context.config,
      workflowCredentials: context.credentials,
    });

    const shop = String(
      (config.shop as string | undefined) ||
        (metadata.shop as string | undefined) ||
        ''
    ).trim();
    if (!shop) {
      throw new Error('Shopify: shop domain missing — reconnect the store or set config.shop');
    }

    const accessToken = String(
      (config.accessToken as string | undefined) ||
        credentials.accessToken ||
        ''
    ).trim();
    if (!accessToken) {
      throw new Error('Shopify: access token missing from the connection');
    }

    const apiVersion = String(
      (config.apiVersion as string | undefined) ||
        (metadata.apiVersion as string | undefined) ||
        '2024-10'
    ).trim();

    const client = new ShopifyService(shop, accessToken, apiVersion);

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'list_products';

    const first = config.first !== undefined ? Number(config.first) : undefined;
    const after = typeof config.after === 'string' ? config.after : undefined;
    const query = typeof config.query === 'string' ? config.query : undefined;
    const id = config.id !== undefined ? (config.id as string | number) : undefined;

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'shopify',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'get_shop': {
        return { success: true, action, shop: await client.getShop() };
      }
      case 'list_products': {
        const result = await client.listProducts({ first, after, query });
        return {
          success: true,
          action,
          products: result.nodes,
          count: result.nodes.length,
          pageInfo: result.pageInfo,
        };
      }
      case 'search_products': {
        const result = await client.listProducts({ first, after, query });
        return {
          success: true,
          action,
          products: result.nodes,
          count: result.nodes.length,
          pageInfo: result.pageInfo,
        };
      }
      case 'get_product': {
        if (id === undefined) throw new Error('Shopify: "id" is required for get_product');
        return { success: true, action, product: await client.getProduct(id) };
      }
      case 'list_orders': {
        const result = await client.listOrders({ first, after, query });
        return {
          success: true,
          action,
          orders: result.nodes,
          count: result.nodes.length,
          pageInfo: result.pageInfo,
        };
      }
      case 'get_order': {
        if (id === undefined) throw new Error('Shopify: "id" is required for get_order');
        return { success: true, action, order: await client.getOrder(id) };
      }
      case 'list_customers': {
        const result = await client.listCustomers({ first, after, query });
        return {
          success: true,
          action,
          customers: result.nodes,
          count: result.nodes.length,
          pageInfo: result.pageInfo,
        };
      }
      case 'search_customers': {
        const result = await client.listCustomers({ first, after, query });
        return {
          success: true,
          action,
          customers: result.nodes,
          count: result.nodes.length,
          pageInfo: result.pageInfo,
        };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'list_products';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    if ((action === 'get_product' || action === 'get_order') && config.id === undefined) {
      errors.push(`"id" is required for ${action}`);
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

export default ShopifyProcessor;
