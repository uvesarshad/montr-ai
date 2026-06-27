/**
 * Notion integration — REST API v1.
 *
 * Auth: internal integration secret OR OAuth access token.
 * Notion-Version header pinned to 2022-06-28 (still widely supported).
 *
 * Actions:
 *   create_page      — create page in a database or under a parent page
 *   update_page      — edit properties / archive
 *   query_database   — filter + sort a database
 *   append_blocks    — append content blocks to a page
 *   get_page         — retrieve a page
 *   get_database     — retrieve database metadata
 *   search           — search pages by title
 *
 * Config:
 *   credentialId?: string       — credential key { apiKey }
 *   apiKey?: string             — direct integration secret
 *   action: string              — one of the actions above (default 'create_page')
 *   databaseId?: string         — for database-scoped actions
 *   pageId?: string             — for page-scoped actions
 *   parentPageId?: string       — create_page: create under a page parent
 *   properties?: object         — property values (create_page/update_page)
 *   title?: string              — shorthand for the title property
 *   content?: Array<Block>      — rich-text blocks (create_page/append_blocks)
 *   filter?: object             — Notion filter object (query_database)
 *   sorts?: Array<object>       — Notion sort list
 *   startCursor?: string
 *   pageSize?: number           — default 25, cap 100
 *   query?: string              — search mode
 *   archived?: boolean          — update_page: archive/restore
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

type Action =
  | 'create_page'
  | 'update_page'
  | 'query_database'
  | 'append_blocks'
  | 'get_page'
  | 'get_database'
  | 'search';

const VALID_ACTIONS: readonly Action[] = [
  'create_page',
  'update_page',
  'query_database',
  'append_blocks',
  'get_page',
  'get_database',
  'search',
];

export class NotionProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;
    const credId = config.credentialId as string | undefined;
    const cred = (credId && credentials?.[credId]) as Record<string, unknown> | undefined;
    const token = String(
      (cred?.apiKey as string | undefined) ||
        (cred?.accessToken as string | undefined) ||
        (cred?.token as string | undefined) ||
        (config.apiKey as string | undefined) ||
        ''
    ).trim();
    if (!token) throw new Error('Notion: API key is required');

    const rawAction = config.action as string | undefined;
    const action: Action =
      rawAction && VALID_ACTIONS.includes(rawAction as Action)
        ? (rawAction as Action)
        : 'create_page';
    const pageSize = Math.max(1, Math.min(Number(config.pageSize) || 25, 100));

    switch (action) {
      case 'create_page': {
        const databaseId = config.databaseId as string | undefined;
        const parentPageId = config.parentPageId as string | undefined;
        if (!databaseId && !parentPageId) {
          throw new Error('Notion: databaseId or parentPageId is required for create_page');
        }
        const body: Record<string, unknown> = {
          parent: databaseId ? { database_id: databaseId } : { page_id: parentPageId },
          properties: normalizeProperties(
            config.properties as Record<string, unknown> | undefined,
            config.title as string | undefined,
            !!databaseId
          ),
        };
        if (Array.isArray(config.content))
          body.children = normalizeBlocks(config.content as unknown[]);
        return { success: true, action, page: await call('/pages', token, 'POST', body) };
      }
      case 'update_page': {
        const pageId = String(config.pageId || '').trim();
        if (!pageId) throw new Error('Notion: "pageId" is required for update_page');
        const body: Record<string, unknown> = {};
        if (config.properties || config.title) {
          body.properties = normalizeProperties(
            config.properties as Record<string, unknown> | undefined,
            config.title as string | undefined,
            true
          );
        }
        if (config.archived !== undefined) body.archived = !!config.archived;
        return {
          success: true,
          action,
          page: await call(`/pages/${encodeURIComponent(pageId)}`, token, 'PATCH', body),
        };
      }
      case 'query_database': {
        const databaseId = String(config.databaseId || '').trim();
        if (!databaseId) throw new Error('Notion: "databaseId" is required for query_database');
        const body: Record<string, unknown> = { page_size: pageSize };
        if (config.filter) body.filter = config.filter;
        if (config.sorts) body.sorts = config.sorts;
        if (config.startCursor) body.start_cursor = config.startCursor;
        const data = await call(
          `/databases/${encodeURIComponent(databaseId)}/query`,
          token,
          'POST',
          body
        );
        const results = data.results as unknown[] | undefined;
        return {
          success: true,
          action,
          count: results?.length || 0,
          hasMore: !!data.has_more,
          nextCursor: data.next_cursor,
          results: results || [],
        };
      }
      case 'append_blocks': {
        const pageId = String(config.pageId || '').trim();
        if (!pageId) throw new Error('Notion: "pageId" is required for append_blocks');
        if (!Array.isArray(config.content) || config.content.length === 0) {
          throw new Error('Notion: "content" blocks array is required for append_blocks');
        }
        const body = { children: normalizeBlocks(config.content as unknown[]) };
        return {
          success: true,
          action,
          result: await call(
            `/blocks/${encodeURIComponent(pageId)}/children`,
            token,
            'PATCH',
            body
          ),
        };
      }
      case 'get_page': {
        const pageId = String(config.pageId || '').trim();
        if (!pageId) throw new Error('Notion: "pageId" is required for get_page');
        return {
          success: true,
          action,
          page: await call(`/pages/${encodeURIComponent(pageId)}`, token, 'GET'),
        };
      }
      case 'get_database': {
        const databaseId = String(config.databaseId || '').trim();
        if (!databaseId) throw new Error('Notion: "databaseId" is required for get_database');
        return {
          success: true,
          action,
          database: await call(`/databases/${encodeURIComponent(databaseId)}`, token, 'GET'),
        };
      }
      case 'search': {
        const body: Record<string, unknown> = { page_size: pageSize };
        if (config.query) body.query = String(config.query);
        if (config.sorts) body.sort = (config.sorts as unknown[])[0];
        const data = await call('/search', token, 'POST', body);
        const results = data.results as unknown[] | undefined;
        return {
          success: true,
          action,
          count: results?.length || 0,
          hasMore: !!data.has_more,
          nextCursor: data.next_cursor,
          results: results || [],
        };
      }
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.credentialId && !config.apiKey) {
      errors.push('credentialId or apiKey is required');
    }
    const action = (config.action as string | undefined) || 'create_page';
    if (!VALID_ACTIONS.includes(action as Action)) {
      errors.push(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

/**
 * Normalize user-friendly property input into Notion's expected schema.
 *
 * If `properties` is already a Notion-shaped object (values like
 * `{ title: [...] }`), pass through. Otherwise wrap scalars using best-effort
 * inference: strings → rich_text, numbers → number, booleans → checkbox, etc.
 */
function normalizeProperties(
  raw: Record<string, unknown> | undefined,
  title: string | undefined,
  inDatabase: boolean
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      out[key] = isNotionPropertyValue(value) ? value : inferPropertyValue(value);
    }
  }
  if (title && !Object.keys(out).some((k) => k.toLowerCase() === 'title' || k === 'Name')) {
    const titleKey = inDatabase ? 'Name' : 'title';
    out[titleKey] = { title: [{ text: { content: String(title) } }] };
  }
  return out;
}

function isNotionPropertyValue(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const keys = Object.keys(v as object);
  return (
    keys.length === 1 &&
    [
      'title',
      'rich_text',
      'number',
      'select',
      'multi_select',
      'date',
      'people',
      'files',
      'checkbox',
      'url',
      'email',
      'phone_number',
      'relation',
      'status',
    ].includes(keys[0])
  );
}

function inferPropertyValue(v: unknown): unknown {
  if (v == null) return { rich_text: [] };
  if (typeof v === 'boolean') return { checkbox: v };
  if (typeof v === 'number') return { number: v };
  if (typeof v === 'string') {
    if (/^https?:\/\//i.test(v)) return { url: v };
    if (/^\S+@\S+\.\S+$/.test(v)) return { email: v };
    return { rich_text: [{ text: { content: v } }] };
  }
  if (Array.isArray(v)) {
    return { multi_select: (v as unknown[]).map((n) => ({ name: String(n) })) };
  }
  return { rich_text: [{ text: { content: JSON.stringify(v) } }] };
}

/**
 * Normalize shorthand blocks — accept strings as paragraphs, pass full
 * Notion block objects through unchanged.
 */
function normalizeBlocks(blocks: unknown[]): unknown[] {
  return blocks.map((b) => {
    if (typeof b === 'string') {
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: b } }] },
      };
    }
    if (b && typeof b === 'object') {
      const bObj = b as Record<string, unknown>;
      if (bObj.type && !bObj.object) {
        return { object: 'block', ...bObj };
      }
    }
    return b;
  });
}

async function call(
  path: string,
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const url = `${API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': VERSION,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await safeOutboundFetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (data?.message as string | undefined) ||
      (data?.code as string | undefined) ||
      res.statusText;
    throw new Error(`Notion API: ${res.status} — ${msg}`);
  }
  return data;
}
