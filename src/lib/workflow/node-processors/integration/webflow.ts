/**
 * Webflow integration — Data API v2.
 *
 * Auth: OAuth access token, resolved through the integration connection vault.
 *
 * Actions:
 *   list_sites       — list sites the account can access (default)
 *   list_collections — list collections in a site
 *   list_items       — list items in a collection (paginated)
 *   get_item         — retrieve a single collection item
 *   create_item      — create a collection item (optionally as draft)
 *   update_item      — update a collection item's field data
 *   publish_items    — publish one or more items live
 *
 * Config:
 *   credentialId? / connectionId? / brandId?  — credential resolution
 *   action: string             — one of the actions above (default 'list_sites')
 *   siteId?: string            — list_collections
 *   collectionId?: string      — item-scoped actions
 *   itemId?: string            — get_item / update_item
 *   itemIds?: string[]         — publish_items
 *   fieldData?: object         — create_item / update_item
 *   isDraft?: boolean          — create_item
 *   limit?: number             — list_items (default/cap 100)
 *   offset?: number            — list_items
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { WebflowService } from '@/lib/services/webflow.service';

type Action =
  | 'list_sites'
  | 'list_collections'
  | 'list_items'
  | 'get_item'
  | 'create_item'
  | 'update_item'
  | 'publish_items';

const VALID_ACTIONS: readonly Action[] = [
  'list_sites',
  'list_collections',
  'list_items',
  'get_item',
  'create_item',
  'update_item',
  'publish_items',
];

export class WebflowProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, connectionId } = await resolveProcessorCredentials({
      provider: 'webflow',
      config,
      workflowCredentials: context.credentials,
    });

    const accessToken = String(credentials.accessToken || '').trim();
    if (!accessToken) throw new Error('Webflow: access token is missing from the connection');

    const service = new WebflowService(accessToken);

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'list_sites';

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'webflow',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'list_sites': {
        const sites = await service.listSites();
        return { success: true, action, count: sites.length, sites };
      }
      case 'list_collections': {
        const siteId = String(config.siteId || '').trim();
        if (!siteId) throw new Error('Webflow: "siteId" is required for list_collections');
        const collections = await service.listCollections(siteId);
        return { success: true, action, count: collections.length, collections };
      }
      case 'list_items': {
        const collectionId = String(config.collectionId || '').trim();
        if (!collectionId) throw new Error('Webflow: "collectionId" is required for list_items');
        const result = await service.listItems(collectionId, {
          limit: Number(config.limit) || undefined,
          offset: Number(config.offset) || undefined,
        });
        return {
          success: true,
          action,
          count: result.items.length,
          pagination: result.pagination,
          items: result.items,
        };
      }
      case 'get_item': {
        const collectionId = String(config.collectionId || '').trim();
        const itemId = String(config.itemId || '').trim();
        if (!collectionId) throw new Error('Webflow: "collectionId" is required for get_item');
        if (!itemId) throw new Error('Webflow: "itemId" is required for get_item');
        const item = await service.getItem(collectionId, itemId);
        return { success: true, action, item };
      }
      case 'create_item': {
        const collectionId = String(config.collectionId || '').trim();
        if (!collectionId) throw new Error('Webflow: "collectionId" is required for create_item');
        const fieldData = (config.fieldData as Record<string, unknown> | undefined) || {};
        if (!fieldData || Object.keys(fieldData).length === 0) {
          throw new Error('Webflow: "fieldData" is required for create_item');
        }
        const item = await service.createItem(collectionId, fieldData, !!config.isDraft);
        return { success: true, action, item };
      }
      case 'update_item': {
        const collectionId = String(config.collectionId || '').trim();
        const itemId = String(config.itemId || '').trim();
        if (!collectionId) throw new Error('Webflow: "collectionId" is required for update_item');
        if (!itemId) throw new Error('Webflow: "itemId" is required for update_item');
        const fieldData = (config.fieldData as Record<string, unknown> | undefined) || {};
        if (!fieldData || Object.keys(fieldData).length === 0) {
          throw new Error('Webflow: "fieldData" is required for update_item');
        }
        const item = await service.updateItem(collectionId, itemId, fieldData);
        return { success: true, action, item };
      }
      case 'publish_items': {
        const collectionId = String(config.collectionId || '').trim();
        if (!collectionId) throw new Error('Webflow: "collectionId" is required for publish_items');
        const raw = config.itemIds ?? (config.itemId ? [config.itemId] : []);
        const itemIds = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v)).filter(Boolean);
        if (itemIds.length === 0) {
          throw new Error('Webflow: "itemIds" is required for publish_items');
        }
        const result = await service.publishItems(collectionId, itemIds);
        return { success: true, action, result };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'list_sites';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
