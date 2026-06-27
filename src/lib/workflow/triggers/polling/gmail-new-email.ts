/**
 * Gmail "new email" poll fetcher (H5).
 *
 * Lists messages newer than the cursor and returns them oldest-first. Cursor is
 * the epoch-ms internalDate of the newest message we've already seen:
 *   cursor = { lastInternalDate: string }   // string to dodge JS number precision
 *
 * On the FIRST run (no cursor) we DON'T replay history — we record the newest
 * message's internalDate as the baseline and emit nothing. That avoids firing a
 * workflow for the user's entire inbox the moment they switch it on.
 *
 * Token: resolved from the workflow credential vault entry named by
 * `config.connectionId` (same OAuth-access-token contract the google_workspace
 * node uses). Multi-tenancy: the vault belongs to the org-owned workflow.
 */

import { safeOutboundFetch } from '../../ssrf-guard';
import type { PollFetcher, PollFetcherInput, PollFetcherResult } from './types';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1';
/** Hard cap on messages inspected per tick (newest-first list before diff). */
const LIST_LIMIT = 50;

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
    throw new Error('gmail_new_email: no Google access token. Add a credential and reference it in the trigger.');
  }
  return token;
}

async function gmailCall(url: string, token: string): Promise<Record<string, unknown>> {
  const res = await safeOutboundFetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errData = data?.error as Record<string, unknown> | undefined;
    throw new Error(`gmail_new_email: ${res.status} — ${(errData?.message as string | undefined) || res.statusText}`);
  }
  return data;
}

function header(payloadHeaders: unknown, name: string): string {
  if (!Array.isArray(payloadHeaders)) return '';
  const h = (payloadHeaders as Array<Record<string, unknown>>).find(
    (x) => String(x.name || '').toLowerCase() === name.toLowerCase()
  );
  return h ? String(h.value || '') : '';
}

export const gmailNewEmailFetcher: PollFetcher = {
  source: 'gmail_new_email',

  async fetch(input: PollFetcherInput): Promise<PollFetcherResult> {
    const token = resolveToken(input);
    const cursorObj = (input.cursor && typeof input.cursor === 'object') ? (input.cursor as Record<string, unknown>) : {};
    const lastInternalDate = Number(cursorObj.lastInternalDate) || 0;
    const firstRun = lastInternalDate <= 0;

    // Build the list query. Gmail's `after:` takes epoch SECONDS; we re-filter by
    // exact internalDate (ms) afterwards so boundary messages aren't replayed.
    const params = new URLSearchParams({ maxResults: String(LIST_LIMIT) });
    const queryParts: string[] = [];
    if (input.config.gmailQuery) queryParts.push(String(input.config.gmailQuery));
    if (!firstRun) queryParts.push(`after:${Math.floor(lastInternalDate / 1000)}`);
    if (queryParts.length) params.set('q', queryParts.join(' '));
    if (input.config.gmailLabelId) params.append('labelIds', String(input.config.gmailLabelId));

    const list = await gmailCall(`${GMAIL}/users/me/messages?${params}`, token);
    const stubs = (list.messages as Array<{ id?: string }> | undefined) || [];

    // Fetch metadata for each candidate (capped). Newest-first from the API.
    const detailed: Array<{ id: string; internalDate: number; from: string; subject: string; snippet: string }> = [];
    for (const stub of stubs.slice(0, LIST_LIMIT)) {
      const id = String(stub?.id || '').trim();
      if (!id) continue;
      const msg = await gmailCall(
        `${GMAIL}/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        token
      );
      const internalDate = Number(msg.internalDate) || 0;
      const payload = (msg.payload as Record<string, unknown> | undefined) || {};
      detailed.push({
        id,
        internalDate,
        from: header(payload.headers, 'From'),
        subject: header(payload.headers, 'Subject'),
        snippet: String(msg.snippet || ''),
      });
    }

    const newestSeen = detailed.reduce((max, m) => Math.max(max, m.internalDate), lastInternalDate);

    // First run: establish the baseline, emit nothing.
    if (firstRun) {
      return { newItems: [], nextCursor: { lastInternalDate: String(newestSeen) } };
    }

    const fresh = detailed
      .filter((m) => m.internalDate > lastInternalDate)
      .sort((a, b) => a.internalDate - b.internalDate); // oldest-first

    const newItems = fresh.map((m) => ({
      id: m.id,
      from: m.from,
      subject: m.subject,
      snippet: m.snippet,
      receivedAt: new Date(m.internalDate).toISOString(),
    }));

    return { newItems, nextCursor: { lastInternalDate: String(newestSeen) } };
  },
};
