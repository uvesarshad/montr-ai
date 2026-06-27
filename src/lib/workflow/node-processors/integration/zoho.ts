/**
 * Zoho integration â€” read-only (import direction).
 *
 * Reads from Zoho CRM v2 (Leads / Contacts / Deals / Accounts) and Zoho
 * Campaigns (mailing lists, recent campaigns). No record writes.
 *
 * Auth: an OAuth access token resolved through the standard
 * processor-credentials chain. The CRM API domain and Campaigns region come
 * from the resolved connection metadata (`apiDomain`, `region`).
 *
 * Actions:
 *   get_records        â€” page of records from a CRM module
 *   get_record         â€” a single record by id (config.recordId)
 *   search_records     â€” search a CRM module (criteria/word/email/phone)
 *   list_mailing_lists â€” Zoho Campaigns mailing lists
 *   list_campaigns     â€” Zoho Campaigns recent campaigns
 *
 * Config:
 *   credentialId? / connectionId? / brandId?  â€” credential resolution
 *   action: string          â€” one of the above (default 'get_records')
 *   module?: string         â€” CRM module (Leads/Contacts/Deals/Accounts, default Leads)
 *   recordId?: string       â€” get_record
 *   page?: number           â€” get_records / search_records
 *   perPage?: number        â€” get_records / search_records (cap 200)
 *   fields?: string|string[]â€” get_records
 *   criteria?: string       â€” search_records
 *   word? / email? / phone? â€” search_records
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import { ZohoService } from '@/lib/services/zoho.service';

type Action =
  | 'get_records'
  | 'get_record'
  | 'search_records'
  | 'list_mailing_lists'
  | 'list_campaigns';

const VALID_ACTIONS: readonly Action[] = [
  'get_records',
  'get_record',
  'search_records',
  'list_mailing_lists',
  'list_campaigns',
];

export class ZohoProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, metadata, connectionId } = await resolveProcessorCredentials({
      provider: 'zoho',
      config: context.config,
      workflowCredentials: context.credentials,
    });

    const service = new ZohoService(
      { accessToken: credentials.accessToken },
      {
        apiDomain:
          typeof metadata.apiDomain === 'string' ? (metadata.apiDomain as string) : undefined,
        region: typeof metadata.region === 'string' ? (metadata.region as string) : undefined,
      }
    );

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'get_records';

    const crmModule = String(config.module || 'Leads').trim();
    const page = config.page ? Number(config.page) : undefined;
    const perPage = config.perPage ? Math.min(Number(config.perPage), 200) : undefined;

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'zoho',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'get_records': {
        const result = await service.getRecords(crmModule, {
          page,
          per_page: perPage,
          fields: config.fields as string | string[] | undefined,
        });
        return {
          success: true,
          action,
          module: crmModule,
          count: result.records.length,
          info: result.info,
          records: result.records,
        };
      }
      case 'get_record': {
        const recordId = String(config.recordId || '').trim();
        if (!recordId) throw new Error('Zoho: "recordId" is required for get_record');
        const record = await service.getRecord(crmModule, recordId);
        return { success: true, action, module, record };
      }
      case 'search_records': {
        const result = await service.searchRecords(crmModule, {
          criteria: config.criteria as string | undefined,
          word: config.word as string | undefined,
          email: config.email as string | undefined,
          phone: config.phone as string | undefined,
          page,
          per_page: perPage,
        });
        return {
          success: true,
          action,
          module: crmModule,
          count: result.records.length,
          info: result.info,
          records: result.records,
        };
      }
      case 'list_mailing_lists': {
        const data = await service.getMailingLists();
        return { success: true, action, result: data };
      }
      case 'list_campaigns': {
        const data = await service.getCampaigns();
        return { success: true, action, result: data };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (config.action as string | undefined) || 'get_records';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    const crmModuleActions: Action[] = ['get_records', 'get_record', 'search_records'];
    if (crmModuleActions.includes(action as Action) && config.module) {
      const valid = ['Leads', 'Contacts', 'Deals', 'Accounts'];
      if (!valid.includes(String(config.module))) {
        errors.push(`module must be one of: ${valid.join(', ')}`);
      }
    }
    if (action === 'get_record' && !config.recordId) {
      errors.push('recordId is required for action "get_record"');
    }
    if (
      action === 'search_records' &&
      !config.criteria &&
      !config.word &&
      !config.email &&
      !config.phone
    ) {
      errors.push('search_records requires one of: criteria, word, email, phone');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
