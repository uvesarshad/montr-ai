/**
 * Google Workspace service layer (Gmail + Sheets).
 *
 * Shared, reusable functions backing both the legacy `integration_google_workspace`
 * dispatcher node AND the new first-class `gmail_send` / `sheets_action` nodes.
 * Auth is an OAuth 2.0 bearer access token (resolved by the caller). All outbound
 * calls go through `safeOutboundFetch` (DNS-pinned, SSRF-guarded) — the Google API
 * hosts are fixed public hosts but we still validate for defense-in-depth, matching
 * the rest of the integration service layer.
 *
 * IMPORTANT: this module is the single source of truth for the Gmail-send and the
 * Sheets read/append/update/upsert/lookup operations. The legacy
 * `node-processors/integration/google-workspace.ts` delegates Gmail send + Sheets
 * append/read here for back-compat; the new nodes use these directly.
 */

import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

/* ============================================================
 * Low-level call helper (shared idiom)
 * ==========================================================*/

export async function googleCall(
  url: string,
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await safeOutboundFetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: signal ?? AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errData = data?.error as Record<string, unknown> | undefined;
    const msg =
      (errData?.message as string | undefined) ||
      (data?.error_description as string | undefined) ||
      res.statusText;
    throw new Error(`Google API: ${res.status} — ${msg}`);
  }
  return data;
}

function asArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ============================================================
 * Gmail
 * ==========================================================*/

export interface GmailSendInput {
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  cc?: unknown;
  bcc?: unknown;
  from?: unknown;
  replyTo?: unknown;
}

/** Send an email via Gmail (`users/me/messages/send`). */
export async function gmailSend(
  token: string,
  c: GmailSendInput,
  signal?: AbortSignal
): Promise<{ messageId?: unknown; threadId?: unknown }> {
  const to = asArray(c.to);
  if (!to.length) throw new Error('gmail_send: "to" is required');
  const subject = String(c.subject || '');
  const bodyHtml = c.html ? String(c.html) : '';
  const bodyText = c.text ? String(c.text) : '';
  if (!bodyHtml && !bodyText) throw new Error('gmail_send: "text" or "html" is required');

  const headers = [
    `To: ${to.join(', ')}`,
    c.cc ? `Cc: ${asArray(c.cc).join(', ')}` : '',
    c.bcc ? `Bcc: ${asArray(c.bcc).join(', ')}` : '',
    c.from ? `From: ${c.from}` : '',
    c.replyTo ? `Reply-To: ${c.replyTo}` : '',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: ${bodyHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
    '',
    bodyHtml || bodyText,
  ]
    .filter(Boolean)
    .join('\r\n');

  const raw = Buffer.from(headers, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const data = await googleCall(`${GMAIL}/users/me/messages/send`, token, 'POST', { raw }, signal);
  return { messageId: data.id, threadId: data.threadId };
}

/* ============================================================
 * Sheets — read / append / update / upsert / lookup
 * ==========================================================*/

type ValueInputOption = 'RAW' | 'USER_ENTERED';

function valueInputOption(v: unknown): ValueInputOption {
  return v === 'RAW' ? 'RAW' : 'USER_ENTERED';
}

/** Read a range (`values.get`). Returns the raw 2-D values + a row count. */
export async function sheetsRead(
  token: string,
  spreadsheetId: string,
  range: string,
  signal?: AbortSignal
): Promise<{ range?: unknown; majorDimension?: unknown; values: unknown[]; rowCount: number }> {
  if (!spreadsheetId || !range) {
    throw new Error('sheets read: spreadsheetId and range are required');
  }
  const data = await googleCall(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    token,
    'GET',
    undefined,
    signal
  );
  const values = (data.values as unknown[] | undefined) || [];
  return {
    range: data.range,
    majorDimension: data.majorDimension,
    values,
    rowCount: values.length,
  };
}

/** Append rows (`values.append`). `values` must be a 2-D array. */
export async function sheetsAppend(
  token: string,
  spreadsheetId: string,
  range: string,
  values: unknown[],
  inputOption?: unknown,
  signal?: AbortSignal
): Promise<{ updatedRange?: unknown; updatedRows?: unknown; updatedColumns?: unknown }> {
  if (!spreadsheetId || !range) {
    throw new Error('sheets append: spreadsheetId and range are required');
  }
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('sheets append: "values" (2D array) is required');
  }
  const vio = valueInputOption(inputOption);
  const data = await googleCall(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=${vio}&insertDataOption=INSERT_ROWS`,
    token,
    'POST',
    { values },
    signal
  );
  const updates = data.updates as Record<string, unknown> | undefined;
  return {
    updatedRange: updates?.updatedRange,
    updatedRows: updates?.updatedRows,
    updatedColumns: updates?.updatedColumns,
  };
}

/**
 * Update a single row in place (`values.update`).
 *
 * The target row is given by the A1 `range` (e.g. `Sheet1!A5:D5`). Callers that
 * only know a 1-based row number should pre-build the range. `values` is a 2-D
 * array (usually one row).
 */
export async function sheetsUpdate(
  token: string,
  spreadsheetId: string,
  range: string,
  values: unknown[],
  inputOption?: unknown,
  signal?: AbortSignal
): Promise<{ updatedRange?: unknown; updatedRows?: unknown; updatedCells?: unknown }> {
  if (!spreadsheetId || !range) {
    throw new Error('sheets update: spreadsheetId and range are required');
  }
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('sheets update: "values" (2D array) is required');
  }
  const vio = valueInputOption(inputOption);
  const data = await googleCall(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=${vio}`,
    token,
    'PUT',
    { values },
    signal
  );
  return {
    updatedRange: data.updatedRange,
    updatedRows: data.updatedRows,
    updatedCells: data.updatedCells,
  };
}

/**
 * Resolve a 0-based column index from a header name or an A1 column letter.
 * `header` row is the first row of the scanned range.
 */
function resolveColumnIndex(header: unknown[], match: { column?: string; columnIndex?: number }): number {
  if (typeof match.columnIndex === 'number' && match.columnIndex >= 0) return match.columnIndex;
  const col = (match.column || '').trim();
  if (!col) throw new Error('sheets match: provide a column name or columnIndex');
  // Header-name match (case-insensitive).
  const byName = header.findIndex(
    (h) => String(h).trim().toLowerCase() === col.toLowerCase()
  );
  if (byName >= 0) return byName;
  // A1 column-letter fallback (A=0, B=1, …).
  if (/^[A-Za-z]+$/.test(col)) {
    let idx = 0;
    for (const ch of col.toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64);
    return idx - 1;
  }
  throw new Error(`sheets match: column "${col}" not found in header row`);
}

/** Parse the sheet-name prefix out of an A1 range (e.g. "Sheet1!A:D" → "Sheet1"). */
function sheetNameFromRange(range: string): string | undefined {
  const bang = range.indexOf('!');
  if (bang <= 0) return undefined;
  let name = range.slice(0, bang);
  // Strip surrounding single quotes Google uses for names with spaces.
  if (name.startsWith("'") && name.endsWith("'")) name = name.slice(1, -1).replace(/''/g, "'");
  return name;
}

export interface SheetsMatch {
  /** Header name to match on (preferred). */
  column?: string;
  /** Explicit 0-based column index (overrides `column`). */
  columnIndex?: number;
  /** Value to match (string-compared, case-insensitive trim). */
  value: unknown;
}

export interface SheetsLookupResult {
  rows: unknown[];
  count: number;
  /** 1-based sheet row numbers of each match (header row excluded). */
  matchedRowNumbers: number[];
  header: unknown[];
}

/**
 * Find rows whose `match.column` equals `match.value`.
 *
 * Scans `range` (which should include the header row as its first row), compares
 * the matched column case-insensitively, and returns the matching data rows along
 * with their 1-based sheet row numbers. Output shape `{ rows, count }` is
 * consistent with the CRM `find_records`-style outputs.
 */
export async function sheetsLookup(
  token: string,
  spreadsheetId: string,
  range: string,
  match: SheetsMatch,
  signal?: AbortSignal
): Promise<SheetsLookupResult> {
  const { values } = await sheetsRead(token, spreadsheetId, range, signal);
  if (values.length === 0) {
    return { rows: [], count: 0, matchedRowNumbers: [], header: [] };
  }
  const header = values[0] as unknown[];
  const colIdx = resolveColumnIndex(header, match);
  const wanted = String(match.value ?? '').trim().toLowerCase();

  const rows: unknown[] = [];
  const matchedRowNumbers: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] as unknown[];
    const cell = String(row?.[colIdx] ?? '').trim().toLowerCase();
    if (cell === wanted) {
      rows.push(row);
      // i is 0-based within the scanned range; the actual sheet row depends on
      // where the range started. We surface the in-range 1-based number (header
      // = row 1 of the range) so callers can build an update range.
      matchedRowNumbers.push(i + 1);
    }
  }
  return { rows, count: rows.length, matchedRowNumbers, header };
}

/**
 * Upsert a row: find the first row matching `match.column == match.value`; if
 * found, UPDATE it in place, else APPEND a new row.
 *
 * `range` should cover the data table including the header row (e.g. `Sheet1!A:D`).
 * `values` is the single row to write (1-D array). The matched column is taken
 * from the header row of `range`.
 */
export async function sheetsUpsert(
  token: string,
  spreadsheetId: string,
  range: string,
  match: SheetsMatch,
  rowValues: unknown[],
  inputOption?: unknown,
  signal?: AbortSignal
): Promise<{ operation: 'updated' | 'appended'; matchedRowNumber?: number } & Record<string, unknown>> {
  if (!Array.isArray(rowValues) || rowValues.length === 0) {
    throw new Error('sheets upsert: "values" (single row array) is required');
  }
  const found = await sheetsLookup(token, spreadsheetId, range, match, signal);

  if (found.count > 0) {
    // Build an update range for the first matched row. The range start row maps
    // to row 1 of the scanned values; matchedRowNumbers are 1-based within range.
    const sheetName = sheetNameFromRange(range);
    const startRow = parseRangeStartRow(range);
    const sheetRow = startRow + (found.matchedRowNumbers[0] - 1);
    const updateRange = sheetName ? `${sheetName}!A${sheetRow}` : `A${sheetRow}`;
    const res = await sheetsUpdate(token, spreadsheetId, updateRange, [rowValues], inputOption, signal);
    return { operation: 'updated', matchedRowNumber: sheetRow, ...res };
  }

  const res = await sheetsAppend(token, spreadsheetId, range, [rowValues], inputOption, signal);
  return { operation: 'appended', ...res };
}

/** First data row of an A1 range (e.g. "Sheet1!A2:D" → 2, "Sheet1!A:D" → 1). */
function parseRangeStartRow(range: string): number {
  const a1 = range.includes('!') ? range.slice(range.indexOf('!') + 1) : range;
  const m = /(\d+)/.exec(a1);
  return m ? parseInt(m[1], 10) : 1;
}
