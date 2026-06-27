/**
 * HTTP Request Processor
 *
 * A general-purpose outbound HTTP node. Every outbound request — including
 * pagination follow-ups and manually-followed redirects — goes through
 * `safeOutboundFetch`, which validates the URL and pins DNS to the validated IP
 * (SSRF-safe). The node layers on:
 *   - retry/backoff (network errors + 429 + 5xx, honoring Retry-After)
 *   - pagination (next_link / cursor / offset)
 *   - an auth picker mapped to the credential vault / org-scoped connections
 *   - manual redirect handling that strips auth headers on cross-origin hops
 *   - response-format controls (auto / json / text / binary-base64)
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';

// ---------------------------------------------------------------------------
// Caps (defensive ceilings — config values are clamped to these)
// ---------------------------------------------------------------------------
const MAX_RETRIES_CAP = 5;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_PAGES_CAP = 50;
const DEFAULT_MAX_PAGES = 10;
const MAX_REDIRECTS = 5;
const MAX_BINARY_BYTES = 1_048_576; // 1 MB

type AuthType = 'none' | 'bearer' | 'basic' | 'apiKeyHeader' | 'credential';
type ResponseFormat = 'auto' | 'json' | 'text' | 'binary-base64';
type PaginationMode = 'off' | 'next_link' | 'cursor' | 'offset';

interface PaginationConfig {
  mode?: PaginationMode;
  /** next_link: dot-path in the response body holding the next URL. */
  nextLinkPath?: string;
  /** cursor: dot-path in the response body holding the next cursor token. */
  cursorPath?: string;
  /** cursor: query-param name the cursor is sent back as. */
  cursorParam?: string;
  /** offset: query-param names for offset + limit. */
  offsetParam?: string;
  limitParam?: string;
  /** offset: page size; also the threshold below which a page is "short". */
  limit?: number;
  /** Dot-path to the array of items within each page body (for merging). */
  itemsPath?: string;
  /** Cap on pages to fetch (clamped to MAX_PAGES_CAP). */
  maxPages?: number;
}

export class HttpRequestProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;

    const url = String(config.url || '');
    const method = String(config.method || 'GET').toUpperCase();
    const rawHeaders = (config.headers || {}) as Record<string, unknown>;
    const body = config.body;
    const timeout = Number(config.timeout) || 30000; // 30s default

    if (!url) {
      throw new Error('URL is required');
    }

    // Sensitive headers (Authorization, X-Api-Key, …) must be supplied through
    // the credential / variable system, never as raw client-side strings. Reject
    // literal values so a stolen canvas can't ship a hard-coded bearer token.
    const headers = sanitizeAuthHeaders(rawHeaders);

    // Resolve auth from the picker (vault / connection / inline-secure) and
    // merge onto the header set. Credentials are org-scoped — the org id always
    // comes from the executing workflow, never node config.
    const authHeaders = await resolveAuthHeaders(context);
    Object.assign(headers, authHeaders);

    const followRedirects = config.followRedirects !== false; // default true
    const responseFormat = normalizeResponseFormat(config.responseFormat);

    // Retry policy. Default ON only for idempotent methods (GET/HEAD); mutating
    // methods require explicit opt-in (surfaced in the UI label) to avoid
    // double-submitting non-idempotent requests.
    const retryPolicy = resolveRetryPolicy(config, method);

    const pagination = (config.pagination || {}) as PaginationConfig;
    const paginationMode: PaginationMode =
      pagination.mode && ['next_link', 'cursor', 'offset'].includes(pagination.mode)
        ? pagination.mode
        : 'off';

    // Per-run HTTP budget: the engine increments its httpCalls counter once per
    // integration node and enforces a hard ceiling — but it does NOT expose a
    // per-request hook on the processor context, so a single paginating node
    // could otherwise issue an unbounded number of requests against one budget
    // tick. We therefore cap pages locally (maxPages, hard ceiling
    // MAX_PAGES_CAP). NOTE: if a per-request counter hook is later added to
    // NodeProcessorContext, increment it here too.
    const maxPages = clamp(
      pagination.maxPages ?? DEFAULT_MAX_PAGES,
      1,
      MAX_PAGES_CAP,
    );

    const baseRequest = {
      method,
      headers,
      body,
      timeout,
      followRedirects,
      retryPolicy,
      responseFormat,
      abortSignal: context.abortSignal,
    };

    if (paginationMode === 'off') {
      const page = await this.fetchOnce(url, baseRequest);
      return {
        success: page.ok,
        statusCode: page.status,
        statusText: page.statusText,
        headers: page.headers,
        body: page.body,
      };
    }

    return this.fetchPaginated(url, baseRequest, paginationMode, pagination, maxPages);
  }

  /**
   * Single logical request: a retry loop wrapped around a manual-redirect loop.
   * Both loops re-validate every URL through safeOutboundFetch.
   */
  private async fetchOnce(url: string, req: BaseRequest): Promise<PageResult> {
    let attempt = 0;
    const { retryPolicy } = req;
    // Total tries = 1 + maxRetries when retries are enabled.
    const maxAttempts = retryPolicy.enabled ? retryPolicy.maxRetries + 1 : 1;

    for (;;) {
      attempt++;
      try {
        const result = await fetchWithRedirects(url, req);

        const retryable =
          retryPolicy.enabled &&
          attempt < maxAttempts &&
          (result.status === 429 || result.status >= 500);

        if (retryable) {
          const delay = retryDelay(result.retryAfterMs, attempt, retryPolicy);
          await sleep(delay, req.abortSignal);
          continue;
        }
        return result;
      } catch (error: unknown) {
        // Network-level failure (DNS, connection reset, timeout). The timeout
        // AbortError should NOT be retried indefinitely, but transient network
        // errors are worth a retry within the cap.
        const isAbort = isAbortError(error);
        const canRetry = retryPolicy.enabled && attempt < maxAttempts && !isAbort;
        if (canRetry) {
          await sleep(retryDelay(undefined, attempt, retryPolicy), req.abortSignal);
          continue;
        }
        throw new Error(
          `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Walk pages according to the configured strategy. Every followed page URL is
   * re-validated through safeOutboundFetch (via fetchOnce → fetchWithRedirects).
   */
  private async fetchPaginated(
    startUrl: string,
    req: BaseRequest,
    mode: PaginationMode,
    cfg: PaginationConfig,
    maxPages: number,
  ): Promise<Record<string, unknown>> {
    const pages: PageResult[] = [];
    const itemsPath = typeof cfg.itemsPath === 'string' ? cfg.itemsPath.trim() : '';
    const mergedItems: unknown[] = [];
    let lastResult: PageResult | undefined;

    if (mode === 'offset') {
      const offsetParam = (cfg.offsetParam || 'offset').trim() || 'offset';
      const limitParam = (cfg.limitParam || 'limit').trim() || 'limit';
      const limit = clamp(Number(cfg.limit) || 0, 0, Number.MAX_SAFE_INTEGER);
      let offset = 0;

      for (let i = 0; i < maxPages; i++) {
        const pageUrl = setQueryParams(startUrl, {
          [offsetParam]: String(offset),
          ...(limit > 0 ? { [limitParam]: String(limit) } : {}),
        });
        const result = await this.fetchOnce(pageUrl, req);
        lastResult = result;
        pages.push(result);

        const pageItems = itemsPath ? asArray(getByPath(result.body, itemsPath)) : undefined;
        if (pageItems) mergedItems.push(...pageItems);

        // Stop on a short page (fewer items than the requested limit) or empty.
        const count = pageItems ? pageItems.length : 0;
        if (!pageItems || count === 0 || (limit > 0 && count < limit)) break;
        offset += limit > 0 ? limit : count;
      }
    } else if (mode === 'cursor') {
      const cursorPath = (cfg.cursorPath || 'next_cursor').trim();
      const cursorParam = (cfg.cursorParam || 'cursor').trim() || 'cursor';
      let cursor: string | undefined;

      for (let i = 0; i < maxPages; i++) {
        const pageUrl = cursor
          ? setQueryParams(startUrl, { [cursorParam]: cursor })
          : startUrl;
        const result = await this.fetchOnce(pageUrl, req);
        lastResult = result;
        pages.push(result);

        const pageItems = itemsPath ? asArray(getByPath(result.body, itemsPath)) : undefined;
        if (pageItems) mergedItems.push(...pageItems);

        const next = getByPath(result.body, cursorPath);
        if (next == null || next === '' || next === false) break;
        cursor = String(next);
      }
    } else {
      // next_link: follow a (possibly relative) URL found in the response body.
      const nextLinkPath = (cfg.nextLinkPath || 'next').trim() || 'next';
      let nextUrl: string | undefined = startUrl;

      for (let i = 0; i < maxPages && nextUrl; i++) {
        const result = await this.fetchOnce(nextUrl, req);
        lastResult = result;
        pages.push(result);

        const pageItems = itemsPath ? asArray(getByPath(result.body, itemsPath)) : undefined;
        if (pageItems) mergedItems.push(...pageItems);

        const rawNext = getByPath(result.body, nextLinkPath);
        if (rawNext == null || rawNext === '') {
          nextUrl = undefined;
        } else {
          // Resolve relative next links against the page we just fetched. The
          // resolved absolute URL is re-validated by the next fetchOnce call.
          nextUrl = resolveUrl(String(rawNext), nextUrl);
        }
      }
    }

    const out: Record<string, unknown> = {
      success: lastResult ? lastResult.ok : false,
      statusCode: lastResult?.status ?? 0,
      pages: pages.length,
    };

    if (itemsPath) {
      out.items = mergedItems;
      out.count = mergedItems.length;
    } else {
      // No items path configured — return the array of raw page bodies.
      out.items = pages.map((p) => p.body);
      out.count = pages.length;
    }
    return out;
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    return validateConfig(config);
  }
}

// ===========================================================================
// Request execution helpers
// ===========================================================================

interface RetryPolicy {
  enabled: boolean;
  maxRetries: number;
  baseDelayMs: number;
}

interface BaseRequest {
  method: string;
  headers: Record<string, string>;
  body: unknown;
  timeout: number;
  followRedirects: boolean;
  retryPolicy: RetryPolicy;
  responseFormat: ResponseFormat;
  abortSignal?: AbortSignal;
}

interface PageResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  retryAfterMs?: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Perform one request, manually following redirects so we can re-validate every
 * hop through safeOutboundFetch (preventing an open-redirect → SSRF bypass) and
 * strip auth/cookie headers on cross-origin redirects.
 */
async function fetchWithRedirects(startUrl: string, req: BaseRequest): Promise<PageResult> {
  let currentUrl = startUrl;
  let headers = { ...req.headers };
  let method = req.method;
  let body = req.body;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Combine the per-node timeout with the execution's abort signal so stopping
    // the run cancels an in-flight request mid-fetch (audit H13), and so a
    // node-level timeout still fires independently.
    const timeoutSignal = AbortSignal.timeout(req.timeout);
    const signal = req.abortSignal
      ? AbortSignal.any([timeoutSignal, req.abortSignal])
      : timeoutSignal;

    const requestOptions: RequestInit = {
      method,
      headers: {
        ...(method !== 'GET' && method !== 'HEAD' && body != null
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...headers,
      },
      // Manual redirects: we re-run safeOutboundFetch on each Location so the
      // SSRF guard + DNS pinning apply to redirect targets too.
      redirect: req.followRedirects ? 'manual' : 'error',
      signal,
    };

    if (method !== 'GET' && method !== 'HEAD' && body != null) {
      requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // safeOutboundFetch validates + pins DNS to the resolved IP, closing the
    // SSRF TOCTOU/rebinding window — applied to EVERY hop.
    const response = await safeOutboundFetch(currentUrl, requestOptions);

    if (req.followRedirects && REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) break; // malformed redirect — treat as final response
      if (hop === MAX_REDIRECTS) {
        throw new Error(`Too many redirects (>${MAX_REDIRECTS}).`);
      }
      const nextUrl = resolveUrl(location, currentUrl);

      // Strip credential-bearing headers when the redirect crosses origins, so
      // a token isn't leaked to an attacker-controlled host. 303 (and 301/302
      // for non-GET by convention) downgrade the method to GET + drop the body.
      if (!sameOrigin(currentUrl, nextUrl)) {
        headers = stripSensitiveHeaders(headers);
      }
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== 'GET' && method !== 'HEAD')) {
        method = 'GET';
        body = undefined;
      }
      currentUrl = nextUrl;
      continue;
    }

    return await readResponse(response, req.responseFormat);
  }

  throw new Error(`Too many redirects (>${MAX_REDIRECTS}).`);
}

async function readResponse(
  response: Awaited<ReturnType<typeof safeOutboundFetch>>,
  format: ResponseFormat,
): Promise<PageResult> {
  const contentType = response.headers.get('content-type');
  let parsedBody: unknown;

  const effectiveFormat: ResponseFormat =
    format === 'auto'
      ? contentType?.includes('application/json')
        ? 'json'
        : 'text'
      : format;

  if (effectiveFormat === 'json') {
    // Tolerate JSON content-type with an empty body.
    const text = await response.text();
    parsedBody = text ? safeJsonParse(text) : null;
  } else if (effectiveFormat === 'binary-base64') {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.byteLength > MAX_BINARY_BYTES) {
      throw new Error(
        `Binary response exceeds the ${Math.round(MAX_BINARY_BYTES / 1024)}KB cap (${buf.byteLength} bytes).`,
      );
    }
    parsedBody = buf.toString('base64');
  } else {
    parsedBody = await response.text();
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: redactResponseHeaders(response.headers),
    body: parsedBody,
    retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
  };
}

function resolveRetryPolicy(config: Record<string, unknown>, method: string): RetryPolicy {
  const idempotent = method === 'GET' || method === 'HEAD';
  // Default ON for idempotent methods; mutating methods need explicit opt-in.
  const enabled =
    config.retryOnFail === undefined ? idempotent : config.retryOnFail === true;
  const maxRetries = clamp(Number(config.maxRetries) || 3, 0, MAX_RETRIES_CAP);
  const baseDelayMs = clamp(Number(config.retryDelayMs) || 1000, 0, MAX_RETRY_DELAY_MS);
  return { enabled: enabled && maxRetries > 0, maxRetries, baseDelayMs };
}

/**
 * Honor Retry-After when present (already parsed to ms, capped); otherwise
 * exponential backoff with full jitter, capped at MAX_RETRY_DELAY_MS.
 */
function retryDelay(
  retryAfterMs: number | undefined,
  attempt: number,
  policy: RetryPolicy,
): number {
  if (retryAfterMs != null && retryAfterMs > 0) {
    return Math.min(retryAfterMs, MAX_RETRY_AFTER_MS);
  }
  const exp = policy.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exp, MAX_RETRY_DELAY_MS);
  return Math.floor(Math.random() * capped); // full jitter
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  // Delta-seconds form.
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS);
  }
  // HTTP-date form.
  const when = Date.parse(trimmed);
  if (!Number.isNaN(when)) {
    return Math.min(Math.max(0, when - Date.now()), MAX_RETRY_AFTER_MS);
  }
  return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError' || error.message === 'Aborted')
  );
}

// ===========================================================================
// Auth resolution (credential vault / org-scoped connections)
// ===========================================================================

/**
 * Map the configured auth type onto request headers. For `credential` mode the
 * credential is resolved org-scoped — the org id always comes from the executing
 * workflow, never from node config — and ownership is verified by querying the
 * connection scoped to that org.
 */
async function resolveAuthHeaders(
  context: NodeProcessorContext,
): Promise<Record<string, string>> {
  const { config } = context;
  const authType = normalizeAuthType(config.authType);
  if (authType === 'none') return {};

  if (authType === 'bearer') {
    const token = String(config.bearerToken || '').trim();
    return token && !looksUnresolvedTemplate(token)
      ? { Authorization: `Bearer ${token}` }
      : {};
  }

  if (authType === 'basic') {
    const username = String(config.basicUsername || '');
    const password = String(config.basicPassword || '');
    if (looksUnresolvedTemplate(username) || looksUnresolvedTemplate(password)) return {};
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }

  if (authType === 'apiKeyHeader') {
    const headerName = String(config.apiKeyHeaderName || 'X-Api-Key').trim() || 'X-Api-Key';
    const apiKey = String(config.apiKey || '').trim();
    return apiKey && !looksUnresolvedTemplate(apiKey) ? { [headerName]: apiKey } : {};
  }

  // authType === 'credential' — resolve from the vault / a connection.
  const creds = await resolveCredentialBlob(context);
  return mapCredentialToHeaders(creds, config);
}

/**
 * Resolve a credential blob from either the workflow credential vault
 * (config.credentialId → context.credentials) or an org-scoped
 * IntegrationConnection (config.connectionId). Org id is read from the workflow.
 */
async function resolveCredentialBlob(
  context: NodeProcessorContext,
): Promise<Record<string, string>> {
  const { config } = context;

  // 1. Workflow credential vault.
  const credentialId = typeof config.credentialId === 'string' ? config.credentialId : undefined;
  if (credentialId && context.credentials?.[credentialId]) {
    const cred = context.credentials[credentialId];
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(cred)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }

  // 2. Org-scoped IntegrationConnection (ownership verified by the org filter).
  const connectionId = typeof config.connectionId === 'string' ? config.connectionId : undefined;
  if (connectionId) {
    const resolved = await integrationConnectionRepository.findByIdWithCredentials(
      connectionId
    );
    if (!resolved) {
      throw new Error(`HTTP: credential connection ${connectionId} not found for this organization.`);
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(resolved.credentials)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }

  throw new Error('HTTP: credential auth selected but no credentialId/connectionId provided.');
}

/**
 * Map common credential shapes onto request headers:
 *   { token | accessToken }      → Authorization: Bearer <token>
 *   { apiKey }                   → <apiKeyHeaderName, default X-Api-Key>: <apiKey>
 *   { username, password }       → Authorization: Basic <base64>
 */
function mapCredentialToHeaders(
  creds: Record<string, string>,
  config: Record<string, unknown>,
): Record<string, string> {
  const token = creds.accessToken || creds.token || creds.bearerToken;
  if (token) return { Authorization: `Bearer ${token}` };

  if (creds.apiKey) {
    const headerName = String(config.apiKeyHeaderName || 'X-Api-Key').trim() || 'X-Api-Key';
    return { [headerName]: creds.apiKey };
  }

  if (creds.username != null && creds.password != null) {
    const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }

  return {};
}

// ===========================================================================
// Header redaction / sanitization (preserve existing behavior)
// ===========================================================================

// Response headers can leak credentials back to anyone with execution-history
// access (Set-Cookie session tokens, auth challenges, vendor api-key echoes).
// Redact the sensitive ones case-insensitively; keep benign metadata
// (content-type, content-length, etag, cache-control, …) intact.
const SENSITIVE_RESPONSE_HEADER_PATTERN =
  /^(set-cookie|cookie|authorization|proxy-authorization|www-authenticate|proxy-authenticate|x-api-key|x-auth-token|x-access-token|x-csrf-token|x-amz-security-token|authentication-info)$/i;

function redactResponseHeaders(
  headers: { entries(): IterableIterator<[string, string]> },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    out[key] = SENSITIVE_RESPONSE_HEADER_PATTERN.test(key) ? '[REDACTED]' : value;
  }
  return out;
}

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
]);

const TEMPLATE_OR_REDACTED = /^(\{\{[\s\S]+\}\}|\*+|<redacted>)$/;

function looksUnresolvedTemplate(value: string): boolean {
  return /\{\{[\s\S]+\}\}/.test(value);
}

/**
 * Drop request headers that must not survive a cross-origin redirect.
 */
function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeAuthHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value == null) continue;
    const str = String(value);
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lower)) {
      // After variable resolution any remaining `{{...}}` means the template
      // failed to resolve — drop it rather than send a literal placeholder.
      if (looksUnresolvedTemplate(str)) continue;
      // The save-time validator (validateConfig) refuses raw literals for these
      // header names, so anything reaching here was produced by variable/
      // credential resolution and is safe to forward.
    }
    out[key] = str;
  }
  return out;
}

// ===========================================================================
// Small utilities
// ===========================================================================

function normalizeAuthType(value: unknown): AuthType {
  const v = String(value || 'none');
  return (['none', 'bearer', 'basic', 'apiKeyHeader', 'credential'] as const).includes(v as AuthType)
    ? (v as AuthType)
    : 'none';
}

function normalizeResponseFormat(value: unknown): ResponseFormat {
  const v = String(value || 'auto');
  return (['auto', 'json', 'text', 'binary-base64'] as const).includes(v as ResponseFormat)
    ? (v as ResponseFormat)
    : 'auto';
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Resolve a (possibly relative) URL against a base. */
function resolveUrl(target: string, base: string): string {
  try {
    return new URL(target, base).toString();
  } catch {
    return target;
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** Set/overwrite query params on a URL string. */
function setQueryParams(url: string, params: Record<string, string>): string {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

/** Read a dot-path (e.g. "paging.next") out of an object. */
function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

// ===========================================================================
// Validation
// ===========================================================================

function validateConfig(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  if (!config.url) {
    errors.push('URL is required');
  } else {
    try {
      new URL(String(config.url));
    } catch {
      errors.push('Invalid URL format');
    }
  }

  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
  if (config.method && !validMethods.includes(String(config.method).toUpperCase())) {
    errors.push(`Method must be one of: ${validMethods.join(', ')}`);
  }

  if (config.timeout !== undefined) {
    const t = Number(config.timeout);
    if (!Number.isFinite(t) || t < 1000 || t > 300000) {
      errors.push('Timeout must be between 1000ms and 300000ms (5 minutes)');
    }
  }

  if (config.maxRetries !== undefined) {
    const r = Number(config.maxRetries);
    if (!Number.isFinite(r) || r < 0 || r > MAX_RETRIES_CAP) {
      errors.push(`maxRetries must be between 0 and ${MAX_RETRIES_CAP}`);
    }
  }

  if (config.retryDelayMs !== undefined) {
    const d = Number(config.retryDelayMs);
    if (!Number.isFinite(d) || d < 0 || d > MAX_RETRY_DELAY_MS) {
      errors.push(`retryDelayMs must be between 0 and ${MAX_RETRY_DELAY_MS}`);
    }
  }

  const responseFormat = config.responseFormat;
  if (
    responseFormat !== undefined &&
    !['auto', 'json', 'text', 'binary-base64'].includes(String(responseFormat))
  ) {
    errors.push('responseFormat must be one of: auto, json, text, binary-base64');
  }

  const authType = config.authType;
  if (
    authType !== undefined &&
    !['none', 'bearer', 'basic', 'apiKeyHeader', 'credential'].includes(String(authType))
  ) {
    errors.push('authType must be one of: none, bearer, basic, apiKeyHeader, credential');
  }
  if (authType === 'credential' && !config.credentialId && !config.connectionId) {
    errors.push('credential auth requires a credentialId or connectionId');
  }

  const pagination = config.pagination as PaginationConfig | undefined;
  if (pagination && pagination.mode !== undefined && pagination.mode !== null) {
    if (!['off', 'next_link', 'cursor', 'offset'].includes(String(pagination.mode))) {
      errors.push('pagination.mode must be one of: off, next_link, cursor, offset');
    }
    if (pagination.maxPages !== undefined) {
      const m = Number(pagination.maxPages);
      if (!Number.isFinite(m) || m < 1 || m > MAX_PAGES_CAP) {
        errors.push(`pagination.maxPages must be between 1 and ${MAX_PAGES_CAP}`);
      }
    }
  }

  // Sensitive headers must be templates / variable references — never literal
  // tokens. This forces users to wire real secrets through the credential
  // store instead of pasting bearer tokens into the canvas JSON.
  const headers = (config.headers || {}) as Record<string, unknown>;
  for (const [name, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) continue;
    const str = typeof value === 'string' ? value : String(value ?? '');
    if (!str) continue;
    if (!TEMPLATE_OR_REDACTED.test(str)) {
      errors.push(
        `Header "${name}" must reference a credential/variable using {{...}} syntax — raw secrets are not allowed.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
