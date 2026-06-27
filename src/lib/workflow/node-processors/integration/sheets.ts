/**
 * Google Sheets action processor (subType `sheets_action`).
 *
 * First-class promotion of Google Sheets out of the `google_workspace` dispatcher,
 * adding the operations that were missing: update_row, upsert_row, lookup_rows
 * (append_row / read existed). Delegates to the shared service layer
 * (`google-workspace.service.ts`) which is the single source of truth.
 *
 * Auth: OAuth 2.0 access token (credentialId vault or inline accessToken), same
 * resolution as the legacy node.
 *
 * Config:
 *   action: 'append_row' | 'update_row' | 'upsert_row' | 'lookup_rows' | 'read'
 *   spreadsheetId: string              — the sheet id [required]
 *   range: string                      — A1 range (include header row for match ops)
 *   values?: array                     — row values; 2-D for append/update, 1-D for upsert
 *   matchColumn? / matchColumnIndex?   — column to match on (upsert/update/lookup)
 *   matchValue?                        — value to match
 *   rowNumber?                         — explicit 1-based sheet row (update_row alt path)
 *   valueInputOption?: 'RAW' | 'USER_ENTERED'
 *
 * lookup_rows is read-only and never simulated. Write actions honor `context.dryRun`.
 * Output: action + operation-specific fields; lookup → { rows, count }.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import {
  sheetsRead,
  sheetsAppend,
  sheetsUpdate,
  sheetsUpsert,
  sheetsLookup,
} from '@/lib/services/google-workspace.service';

type Action = 'append_row' | 'update_row' | 'upsert_row' | 'lookup_rows' | 'read';

const VALID_ACTIONS: readonly Action[] = [
  'append_row',
  'update_row',
  'upsert_row',
  'lookup_rows',
  'read',
];

const WRITE_ACTIONS: ReadonlySet<Action> = new Set(['append_row', 'update_row', 'upsert_row']);

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function resolveToken(context: NodeProcessorContext): string {
  const { config, credentials } = context;
  const credId = asString(config.credentialId);
  const cred = credId && credentials ? credentials[credId] : undefined;
  const token = String(
    (cred && (asString(cred.accessToken) || asString(cred.token))) ||
      asString(config.accessToken) ||
      ''
  ).trim();
  if (!token) throw new Error('Sheets: access token is required (credentialId or accessToken)');
  return token;
}

/** Accept `values` as an array or a JSON string (sidebar writes a JSON string). */
function parseValues(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Sheets: "values" must be a JSON array');
    }
    if (Array.isArray(parsed)) return parsed;
    throw new Error('Sheets: "values" JSON must be an array');
  }
  return [];
}

function buildMatch(config: Record<string, unknown>): {
  column?: string;
  columnIndex?: number;
  value: unknown;
} {
  const columnIndex =
    config.matchColumnIndex !== undefined && config.matchColumnIndex !== ''
      ? Number(config.matchColumnIndex)
      : undefined;
  return {
    column: asString(config.matchColumn),
    columnIndex: Number.isFinite(columnIndex) ? columnIndex : undefined,
    value: config.matchValue,
  };
}

export class SheetsActionProcessor implements NodeProcessor {
  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const action = (asString(config.action) || 'append_row') as Action;
    if (!VALID_ACTIONS.includes(action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    if (!asString(config.spreadsheetId)) errors.push('spreadsheetId is required');
    if (!asString(config.range)) errors.push('range is required');
    if (!config.credentialId && !config.accessToken) {
      errors.push('credentialId or accessToken is required');
    }
    if ((action === 'append_row' || action === 'update_row' || action === 'upsert_row') && !Array.isArray(config.values)) {
      errors.push('values (array) is required for write actions');
    }
    if ((action === 'upsert_row' || action === 'lookup_rows') && !asString(config.matchColumn) && config.matchColumnIndex === undefined) {
      errors.push('matchColumn (or matchColumnIndex) is required for this action');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const action = (asString(config.action) || 'append_row') as Action;
    if (!VALID_ACTIONS.includes(action)) {
      throw new Error(`Sheets: action must be one of ${VALID_ACTIONS.join(', ')}`);
    }
    const spreadsheetId = asString(config.spreadsheetId);
    const range = asString(config.range);
    if (!spreadsheetId || !range) {
      throw new Error('Sheets: spreadsheetId and range are required');
    }

    // Dry-run only short-circuits write actions; reads/lookups are safe.
    if (context.dryRun && WRITE_ACTIONS.has(action)) {
      return {
        simulated: true,
        sent: false,
        wouldSend: { type: 'sheets', action, spreadsheetId, range, values: config.values },
        action,
      };
    }

    const token = resolveToken(context);
    const signal = context.abortSignal;
    const values = Array.isArray(config.values) ? config.values : [];

    switch (action) {
      case 'read': {
        const res = await sheetsRead(token, spreadsheetId, range, signal);
        return { success: true, action, ...res };
      }
      case 'append_row': {
        const res = await sheetsAppend(token, spreadsheetId, range, values, config.valueInputOption, signal);
        return { success: true, action, ...res };
      }
      case 'update_row': {
        // Two ways to target the row: an explicit rowNumber (build A1) or a
        // match (find first match, update it). Otherwise treat `range` as the
        // exact target range.
        const rowNumber = config.rowNumber !== undefined && config.rowNumber !== '' ? Number(config.rowNumber) : undefined;
        if (config.matchColumn || config.matchColumnIndex !== undefined) {
          // Upsert-style match but never append → error if not found.
          const match = buildMatch(config);
          const found = await sheetsLookup(token, spreadsheetId, range, match, signal);
          if (found.count === 0) {
            throw new Error('sheets update_row: no row matched the given column/value');
          }
          const sheetPrefix = range.includes('!') ? `${range.slice(0, range.indexOf('!'))}!` : '';
          const startRowMatch = /(\d+)/.exec(range.includes('!') ? range.slice(range.indexOf('!') + 1) : range);
          const startRow = startRowMatch ? parseInt(startRowMatch[1], 10) : 1;
          const sheetRow = startRow + (found.matchedRowNumbers[0] - 1);
          const updateRange = `${sheetPrefix}A${sheetRow}`;
          const res = await sheetsUpdate(token, spreadsheetId, updateRange, values, config.valueInputOption, signal);
          return { success: true, action, matchedRowNumber: sheetRow, ...res };
        }
        if (Number.isFinite(rowNumber)) {
          const sheetPrefix = range.includes('!') ? `${range.slice(0, range.indexOf('!'))}!` : '';
          const updateRange = `${sheetPrefix}A${rowNumber}`;
          const res = await sheetsUpdate(token, spreadsheetId, updateRange, values, config.valueInputOption, signal);
          return { success: true, action, matchedRowNumber: rowNumber, ...res };
        }
        const res = await sheetsUpdate(token, spreadsheetId, range, values, config.valueInputOption, signal);
        return { success: true, action, ...res };
      }
      case 'upsert_row': {
        const match = buildMatch(config);
        // Upsert writes a single row (1-D). Accept either a 1-D array or the
        // first element of a 2-D values array for convenience.
        const rowValues = Array.isArray(values[0]) ? (values[0] as unknown[]) : (values as unknown[]);
        const res = await sheetsUpsert(token, spreadsheetId, range, match, rowValues, config.valueInputOption, signal);
        return { success: true, action, ...res };
      }
      case 'lookup_rows': {
        const match = buildMatch(config);
        const res = await sheetsLookup(token, spreadsheetId, range, match, signal);
        // find_records-style output shape.
        return { success: true, action, rows: res.rows, count: res.count, matchedRowNumbers: res.matchedRowNumbers, header: res.header };
      }
    }
  }
}
