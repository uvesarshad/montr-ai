/**
 * Mailchimp integration — Marketing API 3.0.
 *
 * IMPORT-ONLY (product decision): every action reads data. No create / update /
 * delete / subscribe actions exist here and none should be added.
 *
 * Auth: resolved via resolveProcessorCredentials → OAuth accessToken or a
 * classic apiKey; the datacenter comes from connection metadata.
 *
 * Actions:
 *   list_audiences       — list audiences (lists)            [default]
 *   get_audience         — retrieve one audience
 *   list_members         — list members of an audience
 *   get_member           — retrieve one member by email
 *   search_members       — search members across audiences
 *   list_campaigns       — list campaigns
 *   get_campaign_report  — campaign performance report
 *
 * Config:
 *   credentialId?: string   — workflow credential vault key
 *   connectionId?: string   — explicit IntegrationConnection id
 *   brandId?: string        — brand-scoped connection resolution
 *   action: string          — one of the actions above (default 'list_audiences')
 *   listId?: string         — get_audience / list_members / get_member
 *   email?: string          — get_member (hashed to the subscriber id)
 *   query?: string          — search_members
 *   campaignId?: string     — get_campaign_report
 *   status?: string         — list_members filter (subscribed, …)
 *   count?: number          — page size (default 10, cap 100)
 *   offset?: number         — page offset
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { MailchimpService } from '@/lib/services/mailchimp.service';

type Action =
  | 'list_audiences'
  | 'get_audience'
  | 'list_members'
  | 'get_member'
  | 'search_members'
  | 'list_campaigns'
  | 'get_campaign_report';

const VALID_ACTIONS: readonly Action[] = [
  'list_audiences',
  'get_audience',
  'list_members',
  'get_member',
  'search_members',
  'list_campaigns',
  'get_campaign_report',
];

export class MailchimpProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, metadata, connectionId } = await resolveProcessorCredentials({
      provider: 'mailchimp',
      config: context.config,
      workflowCredentials: context.credentials,
    });

    const service = new MailchimpService({
      accessToken: credentials.accessToken,
      apiKey: credentials.apiKey,
      apiEndpoint:
        typeof metadata.apiEndpoint === 'string' ? metadata.apiEndpoint : undefined,
      dc: typeof metadata.dc === 'string' ? metadata.dc : undefined,
    });

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'list_audiences';

    const count = config.count !== undefined ? Number(config.count) : undefined;
    const offset = config.offset !== undefined ? Number(config.offset) : undefined;

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'mailchimp',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'list_audiences': {
        const data = await service.listAudiences({ count, offset });
        return { success: true, action, result: data };
      }
      case 'get_audience': {
        const listId = String(config.listId || '').trim();
        if (!listId) throw new Error('Mailchimp: "listId" is required for get_audience');
        const data = await service.getAudience(listId);
        return { success: true, action, result: data };
      }
      case 'list_members': {
        const listId = String(config.listId || '').trim();
        if (!listId) throw new Error('Mailchimp: "listId" is required for list_members');
        const status =
          typeof config.status === 'string' ? config.status : undefined;
        const data = await service.listMembers(listId, { count, offset, status });
        return { success: true, action, result: data };
      }
      case 'get_member': {
        const listId = String(config.listId || '').trim();
        if (!listId) throw new Error('Mailchimp: "listId" is required for get_member');
        const email = String(config.email || '').trim();
        if (!email) throw new Error('Mailchimp: "email" is required for get_member');
        const hash = MailchimpService.subscriberHash(email);
        const data = await service.getMember(listId, hash);
        return { success: true, action, result: data };
      }
      case 'search_members': {
        const query = String(config.query || '').trim();
        if (!query) throw new Error('Mailchimp: "query" is required for search_members');
        const data = await service.searchMembers(query);
        return { success: true, action, result: data };
      }
      case 'list_campaigns': {
        const data = await service.listCampaigns({ count, offset });
        return { success: true, action, result: data };
      }
      case 'get_campaign_report': {
        const campaignId = String(config.campaignId || '').trim();
        if (!campaignId) {
          throw new Error('Mailchimp: "campaignId" is required for get_campaign_report');
        }
        const data = await service.getCampaignReport(campaignId);
        return { success: true, action, result: data };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'list_audiences';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    if ((action === 'get_audience' || action === 'list_members' || action === 'get_member') && !config.listId) {
      errors.push('listId is required for this action');
    }
    if (action === 'get_member' && !config.email) {
      errors.push('email is required for get_member');
    }
    if (action === 'search_members' && !config.query) {
      errors.push('query is required for search_members');
    }
    if (action === 'get_campaign_report' && !config.campaignId) {
      errors.push('campaignId is required for get_campaign_report');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
