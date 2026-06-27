/**
 * Document loader — reads PDF / DOCX / TXT / MD files and returns plain text.
 *
 * Source options:
 *   url: http(s) URL (SSRF-guarded), or
 *   dataUri: data: URI with base64 payload
 *
 * Type detection: prefer explicit `type`, fall back to content-type header,
 * then file extension in the URL.
 *
 * Config:
 *   url?: string              — remote file (one of url/dataUri required)
 *   dataUri?: string          — inline data: URI
 *   type?: 'pdf'|'docx'|'txt'|'md'   — explicit type override
 *   maxChars?: number         — cap on returned text (default 100k, max 500k)
 *   maxBytes?: number         — max source size (default 20MB, cap 50MB)
 *
 * Output: `{ text, type, length, pages?, bytes }`
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const DEFAULT_MAX_CHARS = 100_000;
const HARD_MAX_CHARS = 500_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const HARD_MAX_BYTES = 50 * 1024 * 1024;

type DocType = 'pdf' | 'docx' | 'txt' | 'md';
const VALID_TYPES: readonly DocType[] = ['pdf', 'docx', 'txt', 'md'];

export class DocumentProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const url = String(config.url || '').trim();
    const dataUri = String(config.dataUri || '').trim();
    if (!url && !dataUri) {
      throw new Error('Document: either "url" or "dataUri" is required');
    }

    const maxChars = Math.max(500, Math.min(Number(config.maxChars) || DEFAULT_MAX_CHARS, HARD_MAX_CHARS));
    const maxBytes = Math.max(1024, Math.min(Number(config.maxBytes) || DEFAULT_MAX_BYTES, HARD_MAX_BYTES));

    const { buffer, contentType, filename } = await loadSource(url || dataUri, maxBytes);
    const type = resolveType(config.type, contentType, filename);

    let text = '';
    let pages: number | undefined;

    if (type === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      // PDFParse constructor accepts a buffer-like object; cast through unknown for safety.
      const parser = new PDFParse({ data: new Uint8Array(buffer) } as unknown as ConstructorParameters<typeof PDFParse>[0]);
      const result = await parser.getText() as unknown as Record<string, unknown>;
      text = String(result?.text || '');
      pages =
        typeof result?.total === 'number'
          ? (result.total as number)
          : Array.isArray(result?.pages)
            ? (result.pages as unknown[]).length
            : undefined;
    } else if (type === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = String(result.value || '');
    } else {
      // txt / md — decode as UTF-8
      text = buffer.toString('utf8');
    }

    const normalized = text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
    const clipped = normalized.slice(0, maxChars);

    return {
      success: true,
      type,
      text: clipped,
      length: clipped.length,
      truncated: normalized.length > maxChars,
      bytes: buffer.length,
      ...(pages !== undefined ? { pages } : {}),
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.url && !config.dataUri) errors.push('url or dataUri is required');
    if (config.type && !VALID_TYPES.includes(config.type as DocType)) {
      errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

async function loadSource(
  source: string,
  maxBytes: number
): Promise<{ buffer: Buffer; contentType?: string; filename?: string }> {
  const dataMatch = /^data:([^;,]+);base64,(.*)$/i.exec(source);
  if (dataMatch) {
    const [, contentType, b64] = dataMatch;
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > maxBytes) {
      throw new Error(`Document: payload exceeds ${Math.round(maxBytes / 1_048_576)}MB`);
    }
    return { buffer, contentType };
  }

  const res = await safeOutboundFetch(source, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`Document: failed to fetch (${res.status} ${res.statusText})`);
  }
  const contentType = res.headers.get('content-type') || undefined;

  // Check content-length early when present
  const cl = Number(res.headers.get('content-length') || '0');
  if (cl && cl > maxBytes) {
    throw new Error(`Document: payload exceeds ${Math.round(maxBytes / 1_048_576)}MB (${cl} bytes)`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error(`Document: payload exceeds ${Math.round(maxBytes / 1_048_576)}MB`);
  }

  let filename: string | undefined;
  try {
    filename = new URL(source).pathname.split('/').pop();
  } catch {
    /* ignore */
  }
  return { buffer, contentType, filename };
}

function resolveType(
  override: unknown,
  contentType: string | undefined,
  filename: string | undefined
): DocType {
  if (typeof override === 'string' && VALID_TYPES.includes(override as DocType)) {
    return override as DocType;
  }

  const ct = (contentType || '').toLowerCase();
  if (ct.includes('application/pdf')) return 'pdf';
  if (
    ct.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
    ct.includes('application/docx') ||
    ct.includes('application/msword')
  ) {
    return 'docx';
  }
  if (ct.includes('text/markdown')) return 'md';
  if (ct.startsWith('text/')) return 'txt';

  const ext = (filename || '').toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'md' || ext === 'markdown') return 'md';
  return 'txt';
}
