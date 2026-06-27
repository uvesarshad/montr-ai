/**
 * HubSpot integration — CRM v3 API.
 *
 * IMPORT-ONLY (product decision): every action reads data. The /search calls
 * are POST but are reads. No object create / update / delete actions exist here
 * and none should be added.
 *
 * Auth: resolved via resolveProcessorCredentials → OAuth accessToken
 * (Authorization: Bearer …).
 *
 * Actions:
 *   list_contacts      — list contacts                       [default]
 *   get_contact        — retrieve one contact
 *   search_contacts    — search contacts (query / filters)
 *   get_company        — retrieve one company
 *   search_companies   — search companies (query / filters)
 *   get_deal           — retrieve one deal
 *   search_deals       — search deals (query / filters)
 *   get_list_members   — list memberships of a list
 *
 * Config:
 *   credentialId?: string       — workflow credential vault key
 *   connectionId?: string       — explicit IntegrationConnection id
 *   brandId?: string            — brand-scoped connection resolution
 *   action: string              — one of the actions above (default 'list_contacts')
 *   id?: string                 — get_contact / get_company / get_deal
 *   listId?: string             — get_list_members
 *   query?: string              — *_search free-text query
 *   filterGroups?: Array<object> — *_search HubSpot filter groups
 *   properties?: string[]       — properties to return
 *   sorts?: Array<object>       — *_search sort spec
 *   limit?: number              — page size (default 10, cap 100)
 *   after?: string              — pagination cursor
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import {
  HubspotService,
  type HubspotFilterGroup,
  type HubspotSearchParams,
} from '@/lib/services/hubspot.service';

type Action =
  | 'get_contact'
  | 'search_contacts'
  | 'list_contacts'
  | 'get_company'
  | 'search_companies'
  | 'get_deal'
  | 'search_deals'
  | 'get_list_members';

const VALID_ACTIONS: readonly Action[] = [
  'get_contact',
  'search_contacts',
  'list_contacts',
  'get_company',
  'search_companies',
  'get_deal',
  'search_deals',
  'get_list_members',
];

export class HubspotProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, connectionId } = await resolveProcessorCredentials({
      provider: 'hubspot',
      config: context.config,
      workflowCredentials: context.credentials,
    });

    if (!credentials.accessToken) {
      throw new Error('HubSpot: an OAuth access token is required.');
    }
    const service = new HubspotService(credentials.accessToken);

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'list_contacts';

    const limit = config.limit !== undefined ? Number(config.limit) : undefined;
    const after = typeof config.after === 'string' ? config.after : undefined;
    const properties = Array.isArray(config.properties)
      ? (config.properties as unknown[]).map((p) => String(p))
      : undefined;

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'hubspot',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'list_contacts': {
        const data = await service.listContacts({ limit, after });
        return { success: true, action, result: data };
      }
      case 'get_contact': {
        const id = String(config.id || '').trim();
        if (!id) throw new Error('HubSpot: "id" is required for get_contact');
        const data = await service.getContact(id, properties);
        return { success: true, action, result: data };
      }
      case 'search_contacts': {
        const data = await service.searchContacts(this.buildSearchParams(config, properties));
        return { success: true, action, result: data };
      }
      case 'get_company': {
        const id = String(config.id || '').trim();
        if (!id) throw new Error('HubSpot: "id" is required for get_company');
        const data = await service.getCompany(id, properties);
        return { success: true, action, result: data };
      }
      case 'search_companies': {
        const data = await service.searchCompanies(this.buildSearchParams(config, properties));
        return { success: true, action, result: data };
      }
      case 'get_deal': {
        const id = String(config.id || '').trim();
        if (!id) throw new Error('HubSpot: "id" is required for get_deal');
        const data = await service.getDeal(id, properties);
        return { success: true, action, result: data };
      }
      case 'search_deals': {
        const data = await service.searchDeals(this.buildSearchParams(config, properties));
        return { success: true, action, result: data };
      }
      case 'get_list_members': {
        const listId = String(config.listId || '').trim();
        if (!listId) throw new Error('HubSpot: "listId" is required for get_list_members');
        const data = await service.getListMemberships(listId, { limit, after });
        return { success: true, action, result: data };
      }
    }
      }
    );
  }

  private buildSearchParams(
    config: Record<string, unknown>,
    properties?: string[]
  ): HubspotSearchParams {
    return {
      query: typeof config.query === 'string' ? config.query : undefined,
      filterGroups: Array.isArray(config.filterGroups)
        ? (config.filterGroups as HubspotFilterGroup[])
        : undefined,
      properties,
      sorts: Array.isArray(config.sorts) ? (config.sorts as unknown[]) : undefined,
      limit: config.limit !== undefined ? Number(config.limit) : undefined,
      after: typeof config.after === 'string' ? config.after : undefined,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'list_contacts';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    if ((action === 'get_contact' || action === 'get_company' || action === 'get_deal') && !config.id) {
      errors.push('id is required for this action');
    }
    if (action === 'get_list_members' && !config.listId) {
      errors.push('listId is required for get_list_members');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
