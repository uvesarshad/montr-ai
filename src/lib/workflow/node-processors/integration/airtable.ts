/**
 * Airtable integration — REST Web API v0 (two-way).
 *
 * Auth: a Personal Access Token (PAT) or OAuth access token, resolved through
 * the standard processor-credentials chain (workflow vault → connection →
 * brand/org connection).
 *
 * Actions:
 *   list_bases     — bases accessible to the token
 *   list_tables    — tables in a base (config.baseId)
 *   list_records   — records in a table (filter/sort/paginate)
 *   get_record     — a single record (config.recordId)
 *   create_record  — create one record (config.fields)
 *   update_record  — patch one record (config.recordId + config.fields)
 *   delete_record  — delete one record (config.recordId)
 *
 * Config:
 *   credentialId? / connectionId? / brandId?   — credential resolution
 *   action: string                  — one of the above (default 'list_records')
 *   baseId: string                  — required for all table/record actions
 *   table: string                   — table id or name (record actions)
 *   recordId?: string               — get/update/delete
 *   fields?: object                 — create/update field values
 *   filterByFormula?: string        — list_records
 *   view?: string                   — list_records
 *   sort?: Array<{field,direction}> — list_records
 *   maxRecords?: number             — list_records
 *   pageSize?: number               — list_records (cap 100)
 *   offset?: string                 — list_records pagination cursor
 *   typecast?: boolean              — create/update
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { resolveProcessorCredentials } from '@/lib/integrations/server/processor-credentials';
import { runWithConnectionHealth } from '@/lib/integrations/server/connection-health';
import {
  AirtableService,
  type ListRecordsOptions,
} from '@/lib/services/airtable.service';

type Action =
  | 'list_bases'
  | 'list_tables'
  | 'list_records'
  | 'get_record'
  | 'create_record'
  | 'update_record'
  | 'delete_record';

const VALID_ACTIONS: readonly Action[] = [
  'list_bases',
  'list_tables',
  'list_records',
  'get_record',
  'create_record',
  'update_record',
  'delete_record',
];

export class AirtableProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const { credentials, connectionId } = await resolveProcessorCredentials({
      provider: 'airtable',
      config: context.config,
      workflowCredentials: context.credentials,
    });

    const service = new AirtableService({
      accessToken: credentials.accessToken,
      apiKey: credentials.apiKey,
    });

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'list_records';

    const baseId = String(config.baseId || '').trim();
    const table = String(config.table || '').trim();
    const recordId = String(config.recordId || '').trim();

    return runWithConnectionHealth(
      {
        connectionId,
        provider: 'airtable',
        userId: context.workflow?.createdById ? String(context.workflow.createdById) : undefined,
      },
      async () => {
    switch (action) {
      case 'list_bases': {
        const bases = await service.listBases();
        return { success: true, action, count: bases.length, bases };
      }
      case 'list_tables': {
        if (!baseId) throw new Error('Airtable: "baseId" is required for list_tables');
        const tables = await service.listTables(baseId);
        return { success: true, action, count: tables.length, tables };
      }
      case 'list_records': {
        if (!baseId) throw new Error('Airtable: "baseId" is required for list_records');
        if (!table) throw new Error('Airtable: "table" is required for list_records');
        const options: ListRecordsOptions = {};
        if (config.filterByFormula) options.filterByFormula = String(config.filterByFormula);
        if (config.maxRecords) options.maxRecords = Number(config.maxRecords);
        if (config.pageSize) options.pageSize = Math.min(Number(config.pageSize), 100);
        if (config.offset) options.offset = String(config.offset);
        if (config.view) options.view = String(config.view);
        if (Array.isArray(config.sort)) {
          options.sort = config.sort as ListRecordsOptions['sort'];
        }
        const result = await service.listRecords(baseId, table, options);
        return {
          success: true,
          action,
          count: result.records.length,
          offset: result.offset,
          hasMore: !!result.offset,
          records: result.records,
        };
      }
      case 'get_record': {
        if (!baseId) throw new Error('Airtable: "baseId" is required for get_record');
        if (!table) throw new Error('Airtable: "table" is required for get_record');
        if (!recordId) throw new Error('Airtable: "recordId" is required for get_record');
        const record = await service.getRecord(baseId, table, recordId);
        return { success: true, action, record };
      }
      case 'create_record': {
        if (!baseId) throw new Error('Airtable: "baseId" is required for create_record');
        if (!table) throw new Error('Airtable: "table" is required for create_record');
        const fields = config.fields as Record<string, unknown> | undefined;
        if (!fields || typeof fields !== 'object') {
          throw new Error('Airtable: "fields" object is required for create_record');
        }
        const created = await service.createRecords(
          baseId,
          table,
          [{ fields }],
          !!config.typecast
        );
        return { success: true, action, record: created[0] ?? null };
      }
      case 'update_record': {
        if (!baseId) throw new Error('Airtable: "baseId" is required for update_record');
        if (!table) throw new Error('Airtable: "table" is required for update_record');
        if (!recordId) throw new Error('Airtable: "recordId" is required for update_record');
        const fields = config.fields as Record<string, unknown> | undefined;
        if (!fields || typeof fields !== 'object') {
          throw new Error('Airtable: "fields" object is required for update_record');
        }
        const updated = await service.updateRecords(
          baseId,
          table,
          [{ id: recordId, fields }],
          !!config.typecast
        );
        return { success: true, action, record: updated[0] ?? null };
      }
      case 'delete_record': {
        if (!baseId) throw new Error('Airtable: "baseId" is required for delete_record');
        if (!table) throw new Error('Airtable: "table" is required for delete_record');
        if (!recordId) throw new Error('Airtable: "recordId" is required for delete_record');
        const deleted = await service.deleteRecords(baseId, table, [recordId]);
        return { success: true, action, deleted: deleted[0] ?? { id: recordId, deleted: false } };
      }
    }
      }
    );
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.credentialId && !config.connectionId && !config.brandId) {
      // Allowed: auto-resolve to the org-level connection at runtime.
    }
    const action = (config.action as string | undefined) || 'list_records';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    const needsBase: Action[] = [
      'list_tables',
      'list_records',
      'get_record',
      'create_record',
      'update_record',
      'delete_record',
    ];
    if (needsBase.includes(action as Action) && !config.baseId) {
      errors.push(`baseId is required for action "${action}"`);
    }
    const needsTable: Action[] = [
      'list_records',
      'get_record',
      'create_record',
      'update_record',
      'delete_record',
    ];
    if (needsTable.includes(action as Action) && !config.table) {
      errors.push(`table is required for action "${action}"`);
    }
    const needsRecordId: Action[] = ['get_record', 'update_record', 'delete_record'];
    if (needsRecordId.includes(action as Action) && !config.recordId) {
      errors.push(`recordId is required for action "${action}"`);
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
