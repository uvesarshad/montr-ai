/**
 * Google Sheets "new row" poll fetcher (H5).
 *
 * Reads the configured sheet via values.get and treats any row beyond the last
 * row count we recorded as new. Cursor:
 *   cursor = { lastRowCount: number }   // total rows including the header row
 *
 * First row is treated as a header and used to key each new row into an object
 * (`asObject`). On the FIRST run we baseline to the current row count and emit
 * nothing (don't replay the whole sheet on switch-on). Rows are returned in sheet
 * order (top-to-bottom = oldest-first).
 *
 * Token: workflow credential vault entry named by `config.connectionId`.
 */

import { safeOutboundFetch } from '../../ssrf-guard';
import type { PollFetcher, PollFetcherInput, PollFetcherResult } from './types';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

function resolveToken(input: PollFetcherInput): string {
  const connectionId = String(input.config.connectionId || '').trim();
  const fromVault = connectionId ? input.credentials?.[connectionId] : undefined;
  const credObj = (fromVault && typeof fromVault === 'object') ? (fromVault as Record<string, unknown>) : undefined;
  const token = String(
    (credObj?.accessToken as string | undefined) ||
    (credObj?.token as string | undefined) ||
    (typeof fromVault === 'string' ? fromVault : '') ||
    ''
  ).trim();
  if (!token) {
    throw new Error('sheets_new_row: no Google access token. Add a credential and reference it in the trigger.');
  }
  return token;
}

export const sheetsNewRowFetcher: PollFetcher = {
  source: 'sheets_new_row',

  async fetch(input: PollFetcherInput): Promise<PollFetcherResult> {
    const token = resolveToken(input);
    const spreadsheetId = String(input.config.spreadsheetId || '').trim();
    if (!spreadsheetId) throw new Error('sheets_new_row: spreadsheetId is required');
    // Range = whole sheet by name (or default to the first sheet via A:ZZZ).
    const sheetName = String(input.config.sheetName || '').trim();
    const range = sheetName ? `${sheetName}` : 'A:ZZZ';

    const url = `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
    const res = await safeOutboundFetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errData = data?.error as Record<string, unknown> | undefined;
      throw new Error(`sheets_new_row: ${res.status} — ${(errData?.message as string | undefined) || res.statusText}`);
    }

    const rows = (data.values as unknown[][] | undefined) || [];
    const totalRows = rows.length;
    const header = (rows[0] as unknown[] | undefined)?.map((c) => String(c ?? '')) || [];

    const cursorObj = (input.cursor && typeof input.cursor === 'object') ? (input.cursor as Record<string, unknown>) : {};
    const lastRowCount = Number(cursorObj.lastRowCount);
    const firstRun = !Number.isFinite(lastRowCount);

    if (firstRun) {
      return { newItems: [], nextCursor: { lastRowCount: totalRows } };
    }

    // Defensive: if rows shrank (sheet edited/cleared), re-baseline and emit nothing.
    if (totalRows < lastRowCount) {
      return { newItems: [], nextCursor: { lastRowCount: totalRows } };
    }

    const start = Math.max(lastRowCount, 1); // never re-emit the header row
    const newItems: Array<Record<string, unknown> & { id: string }> = [];
    for (let i = start; i < totalRows; i++) {
      const values = (rows[i] as unknown[] | undefined) || [];
      const asObject: Record<string, unknown> = {};
      if (header.length) {
        header.forEach((key, idx) => {
          if (key) asObject[key] = values[idx];
        });
      }
      newItems.push({
        // rowIndex is 1-based to match the sheet's own numbering; doubles as the dedup id.
        id: `${spreadsheetId}:${range}:${i + 1}`,
        rowIndex: i + 1,
        values,
        asObject,
      });
    }

    return { newItems, nextCursor: { lastRowCount: totalRows } };
  },
};
