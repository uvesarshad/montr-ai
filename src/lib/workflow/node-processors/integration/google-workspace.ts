/**
 * Google Workspace integration.
 *
 * Multi-service dispatcher covering the most common Gmail / Drive / Sheets /
 * Docs / Calendar operations. Auth: OAuth 2.0 access token.
 * (Use integration_notion's pattern — provide an OAuth token via credentials
 * with the correct scopes for each action.)
 *
 * Actions:
 *   gmail_send         — send an email (plain text/HTML)
 *   gmail_list         — list/search messages
 *   gmail_get          — fetch a single message (decoded)
 *   drive_list         — list files (q filter)
 *   drive_upload       — upload a file (multipart, from url/dataUri)
 *   sheets_read        — read a range from a spreadsheet
 *   sheets_append      — append rows to a range
 *   docs_create        — create a new Google Doc
 *   calendar_list      — list calendar events
 *   calendar_create    — create a calendar event
 *
 * Config (common):
 *   credentialId?: string          — credential key { accessToken }
 *   accessToken?: string           — direct OAuth bearer
 *   action: string                 — one of the actions above (required)
 *
 * Action-specific fields documented inline.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';
// Shared service layer — single source of truth for Gmail send + Sheets ops.
// This legacy dispatcher delegates those to keep behaviour identical to the
// first-class `gmail_send` / `sheets_action` nodes.
import {
  gmailSend as svcGmailSend,
  sheetsRead as svcSheetsRead,
  sheetsAppend as svcSheetsAppend,
} from '@/lib/services/google-workspace.service';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DOCS = 'https://docs.googleapis.com/v1/documents';
const CALENDAR = 'https://www.googleapis.com/calendar/v3';

const VALID_ACTIONS = [
  'gmail_send',
  'gmail_list',
  'gmail_get',
  'drive_list',
  'drive_upload',
  'sheets_read',
  'sheets_append',
  'docs_create',
  'calendar_list',
  'calendar_create',
] as const;

type Action = (typeof VALID_ACTIONS)[number];

export class GoogleWorkspaceProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;
    const credId = config.credentialId as string | undefined;
    const cred = (credId && credentials?.[credId]) as Record<string, unknown> | undefined;
    const token = String(
      (cred?.accessToken as string | undefined) ||
      (cred?.token as string | undefined) ||
      (config.accessToken as string | undefined) ||
      ''
    ).trim();
    if (!token) throw new Error('Google Workspace: access token is required');

    const rawAction = config.action as string | undefined;
    const action = (rawAction && VALID_ACTIONS.includes(rawAction as Action)) ? (rawAction as Action) : ('' as Action);
    if (!VALID_ACTIONS.includes(action)) {
      throw new Error(`Google Workspace: action must be one of ${VALID_ACTIONS.join(', ')}`);
    }

    switch (action) {
      case 'gmail_send':
        return { success: true, action, ...(await gmailSend(token, config)) };
      case 'gmail_list':
        return { success: true, action, ...(await gmailList(token, config)) };
      case 'gmail_get':
        return { success: true, action, ...(await gmailGet(token, config)) };
      case 'drive_list':
        return { success: true, action, ...(await driveList(token, config)) };
      case 'drive_upload':
        return { success: true, action, ...(await driveUpload(token, config)) };
      case 'sheets_read':
        return { success: true, action, ...(await sheetsRead(token, config)) };
      case 'sheets_append':
        return { success: true, action, ...(await sheetsAppend(token, config)) };
      case 'docs_create':
        return { success: true, action, ...(await docsCreate(token, config)) };
      case 'calendar_list':
        return { success: true, action, ...(await calendarList(token, config)) };
      case 'calendar_create':
        return { success: true, action, ...(await calendarCreate(token, config)) };
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.credentialId && !config.accessToken) {
      errors.push('credentialId or accessToken is required');
    }
    if (!config.action || !VALID_ACTIONS.includes(config.action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

/* ============================================================
 * Gmail
 * ==========================================================*/

async function gmailSend(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Delegate to the shared service (single source of truth).
  return await svcGmailSend(token, c as Parameters<typeof svcGmailSend>[1]);
}

async function gmailList(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    maxResults: String(Math.max(1, Math.min(Number(c.maxResults) || 25, 100))),
  });
  if (c.query) params.set('q', String(c.query));
  if (c.labelIds) asArray(c.labelIds).forEach((l) => params.append('labelIds', l));

  const data = await call(`${GMAIL}/users/me/messages?${params}`, token, 'GET');
  const messages = data.messages as unknown[] | undefined;
  return {
    count: messages?.length || 0,
    nextPageToken: data.nextPageToken,
    messages: messages || [],
  };
}

async function gmailGet(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = String(c.messageId || '').trim();
  if (!id) throw new Error('gmail_get: "messageId" is required');
  const format = c.format ? String(c.format) : 'full';
  const data = await call(
    `${GMAIL}/users/me/messages/${encodeURIComponent(id)}?format=${format}`,
    token,
    'GET'
  );
  return { message: data };
}

/* ============================================================
 * Drive
 * ==========================================================*/

async function driveList(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    pageSize: String(Math.max(1, Math.min(Number(c.pageSize) || 25, 100))),
    fields:
      'nextPageToken,files(id,name,mimeType,parents,webViewLink,webContentLink,modifiedTime,size,owners,trashed)',
  });
  if (c.query) params.set('q', String(c.query));
  if (c.orderBy) params.set('orderBy', String(c.orderBy));
  if (c.pageToken) params.set('pageToken', String(c.pageToken));

  const data = await call(`${DRIVE}/files?${params}`, token, 'GET');
  const files = data.files as unknown[] | undefined;
  return {
    count: files?.length || 0,
    nextPageToken: data.nextPageToken,
    files: files || [],
  };
}

async function driveUpload(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  const filename = String(c.filename || 'upload.bin');
  const mimeType = String(c.mimeType || 'application/octet-stream');
  const parents = c.parentId ? [String(c.parentId)] : undefined;

  const buffer = await loadUploadPayload(c);

  const metadata = {
    name: filename,
    mimeType,
    ...(parents ? { parents } : {}),
  };
  const boundary = `boundary_${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      'utf8'
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`, 'utf8'),
  ]);

  const url = `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,mimeType`;
  const res = await safeOutboundFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const errData = data?.error as Record<string, unknown> | undefined;
    throw new Error(`drive_upload: ${res.status} — ${(errData?.message as string | undefined) || res.statusText}`);
  }
  return { file: data };
}

async function loadUploadPayload(c: Record<string, unknown>): Promise<Buffer> {
  if (c.dataUri) {
    const m = /^data:[^;,]+;base64,(.*)$/i.exec(String(c.dataUri));
    if (!m) throw new Error('drive_upload: invalid dataUri');
    return Buffer.from(m[1], 'base64');
  }
  if (c.content !== undefined) return Buffer.from(String(c.content), 'utf8');
  if (c.url) {
    const res = await safeOutboundFetch(String(c.url), { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`drive_upload: fetch failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('drive_upload: provide url, dataUri, or content');
}

/* ============================================================
 * Sheets
 * ==========================================================*/

async function sheetsRead(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Delegate to the shared service (single source of truth).
  return await svcSheetsRead(token, String(c.spreadsheetId || '').trim(), String(c.range || '').trim());
}

async function sheetsAppend(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Delegate to the shared service (single source of truth).
  return await svcSheetsAppend(
    token,
    String(c.spreadsheetId || '').trim(),
    String(c.range || '').trim(),
    c.values as unknown[],
    c.valueInputOption
  );
}

/* ============================================================
 * Docs
 * ==========================================================*/

async function docsCreate(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  const title = String(c.title || 'Untitled');
  const doc = await call(DOCS, token, 'POST', { title });
  const documentId = doc.documentId as string | undefined;
  if (c.content && typeof c.content === 'string') {
    await call(
      `${DOCS}/${encodeURIComponent(documentId ?? '')}:batchUpdate`,
      token,
      'POST',
      {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: c.content,
            },
          },
        ],
      }
    );
  }
  return { documentId, title: doc.title, revisionId: doc.revisionId };
}

/* ============================================================
 * Calendar
 * ==========================================================*/

async function calendarList(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  const calendarId = encodeURIComponent(String(c.calendarId || 'primary'));
  const params = new URLSearchParams({
    maxResults: String(Math.max(1, Math.min(Number(c.maxResults) || 25, 250))),
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  if (c.timeMin) params.set('timeMin', String(c.timeMin));
  if (c.timeMax) params.set('timeMax', String(c.timeMax));
  if (c.query) params.set('q', String(c.query));

  const data = await call(`${CALENDAR}/calendars/${calendarId}/events?${params}`, token, 'GET');
  const items = data.items as unknown[] | undefined;
  return {
    count: items?.length || 0,
    nextPageToken: data.nextPageToken,
    events: items || [],
  };
}

async function calendarCreate(token: string, c: Record<string, unknown>): Promise<Record<string, unknown>> {
  const calendarId = encodeURIComponent(String(c.calendarId || 'primary'));
  const { summary, description, location, start, end, attendees } = c;
  if (!summary) throw new Error('calendar_create: "summary" is required');
  if (!start || !end) throw new Error('calendar_create: "start" and "end" are required');

  const body: Record<string, unknown> = {
    summary: String(summary),
    ...(description ? { description: String(description) } : {}),
    ...(location ? { location: String(location) } : {}),
    start: normalizeCalendarTime(start),
    end: normalizeCalendarTime(end),
    ...(Array.isArray(attendees) && (attendees as unknown[]).length
      ? {
          attendees: (attendees as unknown[]).map((a) =>
            typeof a === 'string' ? { email: a } : { email: (a as Record<string, unknown>).email, optional: !!(a as Record<string, unknown>).optional }
          ),
        }
      : {}),
  };

  const data = await call(`${CALENDAR}/calendars/${calendarId}/events`, token, 'POST', body);
  return { event: data };
}

function normalizeCalendarTime(v: unknown): Record<string, string> {
  if (v && typeof v === 'object') {
    const vObj = v as Record<string, unknown>;
    if (vObj.dateTime || vObj.date) return vObj as Record<string, string>;
  }
  const s = String(v);
  // All-day if YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: s };
  return { dateTime: s };
}

/* ============================================================
 * Shared
 * ==========================================================*/

function asArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function call(
  url: string,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await safeOutboundFetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const errData = data?.error as Record<string, unknown> | undefined;
    const msg = (errData?.message as string | undefined) || (data?.error_description as string | undefined) || res.statusText;
    throw new Error(`Google API: ${res.status} — ${msg}`);
  }
  return data;
}
